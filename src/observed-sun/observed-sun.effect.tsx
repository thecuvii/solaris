'use client'

// Requires: react

import { useRef, type CSSProperties } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

/*
 * The Sun as photographed from the Earth's surface: a haze-softened,
 * refraction-flattened disc with per-row atmospheric extinction, limb
 * darkening, thin-cloud striations, seeing shimmer, and camera glare.
 *
 * Single fullscreen pass, no textures, no render targets. The physical
 * ingredients are closed-form fits rather than a scattering integral:
 * Kasten–Young airmass, per-channel Rayleigh/aerosol/ozone optical depth,
 * Neckel per-wavelength limb darkening, the NOAA apparent-elevation
 * refraction polynomial, and Spencer/Vos-style glare wings measured from the
 * disc edge. Display is a normalized photographic exposure: the disc centre
 * is the reference luminance, so the same exposure reads sensibly from
 * horizon to noon.
 */

export type ObservedSunEffectProps = {
  className?: string
  /** Thin horizontal cloud/inversion striations across the low disc. */
  cloudStreaks?: number
  /** Editorial magenta flush on the lower disc and its glow. */
  duskFlush?: number
  /** Linear scene gain relative to the disc centre before tone mapping. */
  exposure?: number
  /** Scattering-sky amount. 0 is a dark indigo plate; 1 is the physical field. */
  field?: number
  /** Camera glare strength: near-limb bloom, wide wings, and veiling. */
  glare?: number
  /** Aerosol load. Softens the limb, tightens the aureole, and greys the sky. */
  haze?: number
  /** Chappuis ozone absorption multiplier; controls the pink/purple twilight cast. */
  ozone?: number
  /** Disc and glow chroma. 1 preserves the physical tint. */
  saturation?: number
  /** NOAA apparent-elevation refraction multiplier; flattens the low disc. */
  refraction?: number
  /** Refractive shimmer amplitude near the horizon. */
  seeingAmount?: number
  /** Refractive shimmer speed multiplier. */
  seeingSpeed?: number
  /** Slow drift speed of the cloud striations. */
  streakDrift?: number
  style?: CSSProperties
  /** True solar-centre elevation in degrees. */
  sunElevation?: number
  /** Disc radius as a fraction of the shorter canvas half-side. */
  sunScale?: number
}

type ObservedSunSettings = {
  cloudStreaks: number
  duskFlush: number
  exposure: number
  field: number
  glare: number
  haze: number
  ozone: number
  refraction: number
  saturation: number
  seeingAmount: number
  seeingSpeed: number
  streakDrift: number
  sunElevation: number
  sunScale: number
}

type ObservedSunResources = {
  program: WebGLProgram
  vertexArray: WebGLVertexArrayObject
}

const OBSERVED_SUN_INPUT = null

const VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float uCloudStreaks;
uniform float uDuskFlush;
uniform float uExposure;
uniform float uField;
uniform float uGlare;
uniform float uHaze;
uniform float uOzone;
uniform float uRefraction;
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uSeeingAmount;
uniform float uSeeingSpeed;
uniform float uStreakDrift;
uniform float uSunElevation;
uniform float uSunScale;
uniform float uTime;

out vec4 fragColor;

// Apparent solar radius in degrees (0.533 deg diameter).
const float SUN_RADIUS = 0.2665;
// Editorial exaggeration of the differential extinction across the disc.
const float DISC_GRADIENT_STRETCH = 2.5;
// Horizon-sky radiance relative to the unattenuated disc radiance.
const float SKY_TO_SUN = 4.0e-3;
const vec3 LUMINANCE = vec3(0.2126, 0.7152, 0.0722);
// Sea-level zenith optical depths for ~(650, 550, 450) nm.
const vec3 TAU_RAYLEIGH = vec3(0.050, 0.098, 0.218);
const vec3 TAU_AEROSOL = vec3(0.045, 0.050, 0.060);
// Chappuis band peaks between the red and green channels.
const vec3 TAU_OZONE = vec3(0.030, 0.024, 0.003);
// Neckel per-wavelength limb-darkening exponents (blue darkens fastest).
const vec3 LIMB_EXPONENT = vec3(0.397, 0.503, 0.652);
const vec3 GLARE_TINT = vec3(1.0, 0.80, 0.46);
const vec3 TWILIGHT_PURPLE = vec3(0.42, 0.38, 0.80);
const vec3 DAY_BLUE = vec3(0.22, 0.45, 0.95);
const vec3 DUSK_MAGENTA = vec3(1.42, 0.14, 0.68);
const vec3 INDIGO_FIELD = vec3(0.026, 0.024, 0.055);

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453123);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}

float valueNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm1(float x) {
  return 0.5 * valueNoise1(x) +
    0.3 * valueNoise1(x * 2.13 + 5.2) +
    0.2 * valueNoise1(x * 4.31 + 9.7);
}

float fbm2(vec2 p) {
  return 0.55 * valueNoise2(p) +
    0.3 * valueNoise2(p * 2.07 + vec2(3.1, 7.7)) +
    0.15 * valueNoise2(p * 4.19 + vec2(9.3, 1.7));
}

// NOAA solar-position refraction in degrees for a true elevation in degrees.
float refractionCorrection(float elevationDegrees) {
  if (elevationDegrees > 85.0) return 0.0;
  float tangent = tan(radians(elevationDegrees));
  if (elevationDegrees > 5.0) {
    return (58.1 / tangent - 0.07 / pow(tangent, 3.0) + 0.000086 / pow(tangent, 5.0)) /
      3600.0;
  }
  if (elevationDegrees > -0.575) {
    return (
      1735.0 - 518.2 * elevationDegrees + 103.4 * elevationDegrees * elevationDegrees -
      12.79 * pow(elevationDegrees, 3.0) + 0.711 * pow(elevationDegrees, 4.0)
    ) / 3600.0;
  }
  return (-20.772 / tangent) / 3600.0;
}

float apparentElevation(float trueElevation) {
  return trueElevation + refractionCorrection(trueElevation) * uRefraction;
}

// Kasten–Young (1989) relative airmass; ~38 at the horizon.
float airmass(float elevationDegrees) {
  float h = max(elevationDegrees, 0.0);
  return 1.0 / (sin(radians(h)) + 0.50572 * pow(h + 6.07995, -1.6364));
}

vec3 opticalDepth() {
  return TAU_RAYLEIGH + TAU_AEROSOL * mix(0.3, 2.5, uHaze) + TAU_OZONE * uOzone;
}

vec3 transmittance(float elevationDegrees) {
  return exp(-opticalDepth() * airmass(elevationDegrees));
}

vec3 saturateColor(vec3 color, float amount) {
  float luminance = max(dot(color, LUMINANCE), 0.0);
  return mix(vec3(luminance), color, amount);
}

vec3 acesToneMap(vec3 color) {
  return clamp(
    (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14),
    0.0,
    1.0
  );
}

vec3 linearToSrgb(vec3 color) {
  color = max(color, 0.0);
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), color));
}

float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 screen = (2.0 * gl_FragCoord.xy - uResolution) / min(uResolution.x, uResolution.y);
  // Angular offset from the apparent disc centre, in degrees.
  vec2 angular = screen * (SUN_RADIUS / uSunScale);

  float trueCentre = uSunElevation;
  float apparentCentre = apparentElevation(trueCentre);
  float apparentTop = apparentElevation(trueCentre + SUN_RADIUS);
  float apparentBottom = apparentElevation(trueCentre - SUN_RADIUS);
  float apparentElev = apparentCentre + angular.y;

  // Seeing: low-frequency animated warp of the viewing direction near the horizon.
  float horizonProximity = exp(-max(apparentElev, 0.0) / 2.5);
  float seeingPhase = uTime * uSeeingSpeed;
  vec2 seeing = vec2(
    fbm2(angular * 7.0 + vec2(seeingPhase * 0.55, 0.0)),
    fbm2(angular * 7.0 + vec2(13.7, -seeingPhase * 0.45))
  ) - 0.5;
  vec2 discAngular = angular + seeing * (0.025 * uSeeingAmount * horizonProximity);
  float discApparentElev = apparentCentre + discAngular.y;

  // Apparent -> true disc coordinate. The lower half is compressed more than
  // the upper half because refraction grows fastest toward the horizon.
  float yTrue = discApparentElev < apparentCentre
    ? (discApparentElev - apparentCentre) / max(apparentCentre - apparentBottom, 1e-4) * SUN_RADIUS
    : (discApparentElev - apparentCentre) / max(apparentTop - apparentCentre, 1e-4) * SUN_RADIUS;
  float radial = length(vec2(discAngular.x, yTrue)) / SUN_RADIUS;
  float edgeDistance = (radial - 1.0) * SUN_RADIUS;
  float outsideEdge = max(edgeDistance, 0.0);

  // Direct sunlight colour; the disc centre defines the exposure reference.
  vec3 sunTransmittance = transmittance(trueCentre);
  float centreLuminance = max(dot(sunTransmittance, LUMINANCE), 1e-5);
  vec3 sunTint = sunTransmittance / centreLuminance;

  // Disc: per-row extinction gradient times per-channel limb darkening.
  float mu = sqrt(max(1.0 - radial * radial, 0.0));
  vec3 limb = mix(pow(vec3(mu), LIMB_EXPONENT), vec3(1.0), uHaze * 0.85);
  float rowElevation = trueCentre + yTrue * DISC_GRADIENT_STRETCH * (1.0 + uDuskFlush);
  vec3 discRadiance = transmittance(rowElevation) / centreLuminance * limb;
  float height = clamp(yTrue / SUN_RADIUS, -1.2, 1.2);
  float flush = uDuskFlush * smoothstep(0.28, -0.92, height);
  float discLuminance = max(dot(discRadiance, LUMINANCE), 1e-4);
  discRadiance = mix(
    discRadiance,
    DUSK_MAGENTA * discLuminance / max(dot(DUSK_MAGENTA, LUMINANCE), 1e-4),
    flush
  );
  discRadiance = saturateColor(discRadiance, uSaturation);
  vec3 glowTint = saturateColor(mix(sunTint * GLARE_TINT, DUSK_MAGENTA, flush), uSaturation);
  float edgeWidth = SUN_RADIUS * mix(0.025, 0.45, uHaze);
  float discMask = smoothstep(edgeWidth, -edgeWidth, edgeDistance);

  // Thin horizontal cloud layers: 1D noise along apparent elevation.
  float layerProximity = exp(-max(apparentElev, 0.0) / 6.0);
  float drift = uTime * uStreakDrift;
  float streakCoordinate = discApparentElev * 16.0 + 0.12 * sin(angular.x * 4.0 + 1.3) +
    drift * 0.03;
  float streakNoise = fbm1(streakCoordinate);
  float streakEnvelope = fbm1(discApparentElev * 2.6 + 17.3 + drift * 0.01);
  float streakDensity = smoothstep(0.42, 0.72, streakNoise) * (0.35 + 0.65 * streakEnvelope);
  float streaks = 1.0 - uCloudStreaks * 0.6 * streakDensity * layerProximity;

  // Sky: warm sunlight-tinted haze, ozone twilight purple, or daytime blue.
  float lowSun = smoothstep(14.0, 0.0, trueCentre);
  vec3 warmHaze = sunTint * 0.9;
  vec3 twilight = TWILIGHT_PURPLE * uOzone;
  vec3 horizonSky = mix(warmHaze, twilight, clamp(uHaze * 1.1, 0.0, 1.0));
  vec3 skyBase = mix(DAY_BLUE * 0.8, horizonSky, lowSun);
  float skyRelative = min(SKY_TO_SUN / centreLuminance, 0.45);
  vec3 sky = mix(INDIGO_FIELD, skyBase * skyRelative, uField);

  // Circumsolar aureole: power-law falloff from the disc edge (DeVore 2011).
  vec3 aureole = glowTint * (uHaze * mix(0.002, 0.006, uField) / pow(outsideEdge + 0.12, 1.8));

  // Camera glare: near-limb bloom and Vos-style wings. Veiling is sky-only so a
  // zero field stays an indigo plate instead of a full-screen wash.
  float glareGauss = exp(-pow(outsideEdge / (0.05 + 0.22 * uHaze), 2.0));
  float glareWings = 0.012 / pow(outsideEdge + 0.15, 2.0) + 0.0015 / pow(outsideEdge + 0.15, 3.0);
  vec3 glare = glowTint * (
    uGlare * (0.42 * glareGauss + glareWings * mix(0.2, 1.0, uField) + 0.015 * uField)
  );

  // Apparent horizon with a dark ground. A zero field is a full indigo plate.
  float pixelAngle = (SUN_RADIUS / uSunScale) * 3.0 / max(uResolution.y, 1.0);
  float horizonMask = mix(1.0, smoothstep(-pixelAngle, pixelAngle, apparentElev), uField);
  vec3 above = sky + discRadiance * discMask * streaks + aureole * mix(1.0, streaks, 0.6);
  vec3 ground = sky * 0.08 + vec3(0.004, 0.003, 0.004);
  vec3 scene = mix(ground, above, horizonMask) + glare;

  vec3 mapped = acesToneMap(scene * uExposure * 0.45);
  vec3 posterRamp = mix(
    vec3(1.06, 0.88, 0.32),
    vec3(1.0, 0.18, 0.58),
    smoothstep(0.55, -0.78, height)
  );
  mapped = mix(mapped, saturateColor(posterRamp, uSaturation), discMask * uDuskFlush);
  vec3 displayColor = linearToSrgb(mapped);
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(clamp(displayColor + dither, 0.0, 1.0), 1.0);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Observed Sun shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Observed Sun shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  let fragmentShader: WebGLShader | null = null
  let program: WebGLProgram | null = null
  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    program = gl.createProgram()
    if (!program) throw new Error('Unable to create Observed Sun shader program')
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Unknown Observed Sun shader link error')
    }
    return program
  } catch (error) {
    if (program) gl.deleteProgram(program)
    throw error
  } finally {
    gl.deleteShader(vertexShader)
    if (fragmentShader) gl.deleteShader(fragmentShader)
  }
}

function createResources(gl: WebGL2RenderingContext): ObservedSunResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Observed Sun vertex array')
  try {
    const program = createProgram(gl)
    gl.bindVertexArray(vertexArray)
    return { program, vertexArray }
  } catch (error) {
    gl.deleteVertexArray(vertexArray)
    throw error
  }
}

function deleteResources(gl: WebGL2RenderingContext, resources: ObservedSunResources): void {
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function sanitizedSettings(settings: ObservedSunSettings): ObservedSunSettings {
  return {
    cloudStreaks: clamp(settings.cloudStreaks, 0, 1),
    duskFlush: clamp(settings.duskFlush, 0, 1),
    exposure: clamp(settings.exposure, 0, 8),
    field: clamp(settings.field, 0, 1),
    glare: clamp(settings.glare, 0, 2),
    haze: clamp(settings.haze, 0, 1),
    ozone: clamp(settings.ozone, 0, 2),
    refraction: clamp(settings.refraction, 0, 1.5),
    saturation: clamp(settings.saturation, 0, 2),
    seeingAmount: clamp(settings.seeingAmount, 0, 1),
    seeingSpeed: clamp(settings.seeingSpeed, 0, 3),
    streakDrift: clamp(settings.streakDrift, 0, 3),
    sunElevation: clamp(settings.sunElevation, -1, 70),
    sunScale: clamp(settings.sunScale, 0.1, 0.6),
  }
}

function createObservedSunRenderer(
  canvas: HTMLCanvasElement,
  _input: null,
): CanvasRenderer<ObservedSunSettings> | null {
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: false,
    stencil: false,
  })
  if (!context) return null
  const gl: WebGL2RenderingContext = context

  let contextLost = false
  let disposed = false
  let resources: ObservedSunResources | null = createResources(gl)
  let startTime = performance.now()

  function resize(): void {
    const bounds = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio, 2)
    const width = Math.max(Math.round(bounds.width * dpr), 1)
    const height = Math.max(Math.round(bounds.height * dpr), 1)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }

  function render(timestamp: number, frameSettings: ObservedSunSettings): void {
    if (disposed || contextLost || !resources) return
    const settings = sanitizedSettings(frameSettings)
    const { program, vertexArray } = resources

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(program)
    gl.bindVertexArray(vertexArray)

    const uniform1f = (name: string, value: number) => {
      gl.uniform1f(gl.getUniformLocation(program, name), value)
    }
    uniform1f('uCloudStreaks', settings.cloudStreaks)
    uniform1f('uDuskFlush', settings.duskFlush)
    uniform1f('uExposure', settings.exposure)
    uniform1f('uField', settings.field)
    uniform1f('uGlare', settings.glare)
    uniform1f('uHaze', settings.haze)
    uniform1f('uOzone', settings.ozone)
    uniform1f('uRefraction', settings.refraction)
    gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), canvas.width, canvas.height)
    uniform1f('uSaturation', settings.saturation)
    uniform1f('uSeeingAmount', settings.seeingAmount)
    uniform1f('uSeeingSpeed', settings.seeingSpeed)
    uniform1f('uStreakDrift', settings.streakDrift)
    uniform1f('uSunElevation', settings.sunElevation)
    uniform1f('uSunScale', settings.sunScale)
    uniform1f('uTime', (timestamp - startTime) / 1000)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  function handleContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
    resources = null
  }

  function handleContextRestored(): void {
    if (disposed) return
    contextLost = false
    resources = createResources(gl)
    startTime = performance.now()
    resize()
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  window.addEventListener('resize', resize)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  try {
    resize()
  } catch (error) {
    disposed = true
    resizeObserver.disconnect()
    window.removeEventListener('resize', resize)
    canvas.removeEventListener('webglcontextlost', handleContextLost)
    canvas.removeEventListener('webglcontextrestored', handleContextRestored)
    if (resources) deleteResources(gl, resources)
    resources = null
    throw error
  }

  return {
    render,
    dispose(): void {
      disposed = true
      resizeObserver.disconnect()
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost && resources) deleteResources(gl, resources)
      resources = null
    },
  }
}

export function ObservedSunEffect({
  className,
  cloudStreaks = 0.3,
  duskFlush = 0,
  exposure = 1,
  field = 1,
  glare = 0.4,
  haze = 0.5,
  ozone = 1,
  refraction = 1,
  saturation = 1,
  seeingAmount = 0.35,
  seeingSpeed = 1,
  streakDrift = 1,
  style,
  sunElevation = 2,
  sunScale = 0.36,
}: ObservedSunEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameSettings: ObservedSunSettings = {
    cloudStreaks,
    duskFlush,
    exposure,
    field,
    glare,
    haze,
    ozone,
    refraction,
    saturation,
    seeingAmount,
    seeingSpeed,
    streakDrift,
    sunElevation,
    sunScale,
  }
  useCanvasRenderer(canvasRef, frameSettings, OBSERVED_SUN_INPUT, createObservedSunRenderer)

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', width: '100%', ...style }}
    />
  )
}
