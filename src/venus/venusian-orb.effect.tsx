'use client'

// Requires: react

import { useRef, type CSSProperties } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

type VenusianFrameSettings = {
  axialTilt: number
  cloudContrast: number
  cloudDetail: number
  exposure: number
  flowSpeed: number
  flowStrength: number
  forwardScattering: number
  gloryStrength: number
  lean: boolean
  opticalDepth: number
  spin: number
  sulfurTint: number
  sunAzimuth: number
  sunElevation: number
  yaw: number
  upperHaze: number
}

export type VenusianOrbSource = {
  ready?: () => Promise<void>
  render: () => {
    cloudStructure: TexImageSource
    longitudeOffsetDegrees?: number
  } | null
}

export type VenusianOrbEffectProps = {
  axialTilt?: number
  className?: string
  cloudContrast?: number
  cloudDetail?: number
  exposure?: number
  flowSpeed?: number
  flowStrength?: number
  forwardScattering?: number
  gloryStrength?: number
  lean?: boolean
  opticalDepth?: number
  spin?: number
  source: VenusianOrbSource
  style?: CSSProperties
  sulfurTint?: number
  sunAzimuth?: number
  sunElevation?: number
  yaw?: number
  upperHaze?: number
}

type VenusianResources = {
  cloudStructureTexture: WebGLTexture
  program: WebGLProgram
  uniforms: {
    axialTilt: WebGLUniformLocation
    cloudContrast: WebGLUniformLocation
    cloudDetail: WebGLUniformLocation
    cloudStructureTexture: WebGLUniformLocation
    exposure: WebGLUniformLocation
    flowSpeed: WebGLUniformLocation
    flowStrength: WebGLUniformLocation
    forwardScattering: WebGLUniformLocation
    gloryStrength: WebGLUniformLocation
    longitudeOffset: WebGLUniformLocation
    opticalDepth: WebGLUniformLocation
    pointer: WebGLUniformLocation
    resolution: WebGLUniformLocation
    sourceReady: WebGLUniformLocation
    sulfurTint: WebGLUniformLocation
    sunDirection: WebGLUniformLocation
    yaw: WebGLUniformLocation
    time: WebGLUniformLocation
    upperHaze: WebGLUniformLocation
  }
  vertexArray: WebGLVertexArrayObject
}

type AnisotropyExtension = {
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
  TEXTURE_MAX_ANISOTROPY_EXT: number
}

const VENUS_RADIUS = 0.78
const HAZE_RADIUS = 0.825

const VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

uniform float uAxialTilt;
uniform float uCloudContrast;
uniform float uCloudDetail;
uniform sampler2D uCloudStructureTexture;
uniform float uExposure;
uniform float uFlowSpeed;
uniform float uFlowStrength;
uniform float uForwardScattering;
uniform float uGloryStrength;
uniform float uLongitudeOffset;
uniform float uOpticalDepth;
uniform vec2 uPointer;
uniform vec2 uResolution;
uniform float uSourceReady;
uniform float uSulfurTint;
uniform vec3 uSunDirection;
uniform float uYaw;
uniform float uTime;
uniform float uUpperHaze;

out vec4 fragColor;

const float VENUS_RADIUS = ${VENUS_RADIUS.toFixed(3)};
const float HAZE_RADIUS = ${HAZE_RADIUS.toFixed(3)};
const float HAZE_THICKNESS = HAZE_RADIUS - VENUS_RADIUS;
const float CAMERA_DISTANCE = 2.5;
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

vec3 rotateX(vec3 value, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec3(value.x, cosine * value.y - sine * value.z, sine * value.y + cosine * value.z);
}

vec3 rotateY(vec3 value, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec3(cosine * value.x + sine * value.z, value.y, -sine * value.x + cosine * value.z);
}

vec2 raySphere(vec3 rayOrigin, vec3 rayDirection, float radius) {
  float projection = dot(rayOrigin, rayDirection);
  float discriminant = projection * projection - dot(rayOrigin, rayOrigin) + radius * radius;
  if (discriminant < 0.0) return vec2(-1.0);
  float root = sqrt(discriminant);
  return vec2(-projection - root, -projection + root);
}

vec2 sphereUv(vec3 direction) {
  return vec2(
    fract(atan(direction.x, direction.z) / TAU + 0.5),
    clamp(asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5, 0.0, 1.0)
  );
}

vec4 sampleEquirectangular(sampler2D image, vec3 direction) {
  vec2 uv = sphereUv(direction);
  vec3 directionDx = normalize(direction + dFdx(direction));
  vec3 directionDy = normalize(direction + dFdy(direction));
  vec2 gradientX = sphereUv(directionDx) - uv;
  vec2 gradientY = sphereUv(directionDy) - uv;
  gradientX.x -= round(gradientX.x);
  gradientY.x -= round(gradientY.x);
  return textureGrad(image, uv, gradientX, gradientY);
}

vec3 directionFromLongitudeLatitude(float longitude, float latitude) {
  float latitudeCosine = cos(latitude);
  return vec3(sin(longitude) * latitudeCosine, sin(latitude), cos(longitude) * latitudeCosine);
}

float hash31(vec3 value) {
  value = fract(value * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

float valueNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float x00 = mix(hash31(cell), hash31(cell + vec3(1.0, 0.0, 0.0)), local.x);
  float x10 = mix(
    hash31(cell + vec3(0.0, 1.0, 0.0)),
    hash31(cell + vec3(1.0, 1.0, 0.0)),
    local.x
  );
  float x01 = mix(
    hash31(cell + vec3(0.0, 0.0, 1.0)),
    hash31(cell + vec3(1.0, 0.0, 1.0)),
    local.x
  );
  float x11 = mix(
    hash31(cell + vec3(0.0, 1.0, 1.0)),
    hash31(cell + vec3(1.0, 1.0, 1.0)),
    local.x
  );
  return mix(mix(x00, x10, local.y), mix(x01, x11, local.y), local.z);
}

float fbm(vec3 point) {
  float value = 0.0;
  float weight = 0.54;
  for (int octave = 0; octave < 4; octave += 1) {
    value += valueNoise(point) * weight;
    point = point * 2.03 + vec3(11.1, 7.3, 5.7);
    weight *= 0.48;
  }
  return value / 1.016;
}

vec3 orientedCloudDirection(vec3 radialDirection) {
  vec3 tilted = rotateX(radialDirection, uAxialTilt + uPointer.y * 0.1);
  return rotateY(tilted, uLongitudeOffset + uYaw + uPointer.x * 0.16);
}

vec3 advectedCloudDirection(vec3 direction) {
  if (uFlowStrength <= 0.0001) return direction;

  float longitude = atan(direction.x, direction.z);
  float latitude = asin(clamp(direction.y, -1.0, 1.0));
  float latitudeCosine = max(cos(latitude), 0.0);
  float phase = uTime * uFlowSpeed;
  float differentialDrift = phase * (0.12 * latitudeCosine * latitudeCosine - 0.025);
  float planetaryWave = sin(longitude * 3.0 - phase * 0.52) *
    cos(latitude * 2.0) * 0.022;
  float obliqueWave = sin(longitude * 2.0 + latitude * 5.0 + phase * 0.31) * 0.01;
  longitude += (differentialDrift + planetaryWave + obliqueWave) * uFlowStrength;
  latitude += sin(longitude * 2.0 - phase * 0.21) *
    latitudeCosine * 0.008 * uFlowStrength;
  return directionFromLongitudeLatitude(longitude, latitude);
}

float proceduralCloudDetail(vec3 direction) {
  if (uCloudDetail <= 0.0001) return 0.0;

  float longitude = atan(direction.x, direction.z);
  float latitude = asin(clamp(direction.y, -1.0, 1.0));
  float latitudeSine = abs(sin(latitude));
  float latitudeCosine = max(cos(latitude), 0.0);
  float phase = uTime * uFlowSpeed;

  vec3 cellularDomain = direction * 9.0 + vec3(phase * 0.09, -phase * 0.035, phase * 0.06);
  float cellularBroad = fbm(cellularDomain * 0.52);
  float cellularFine = fbm(cellularDomain + (cellularBroad - 0.5) * 2.2);
  float cellular = (cellularFine - 0.5) * 0.78 + (cellularBroad - 0.5) * 0.3;

  float streakWarp = fbm(direction * 5.2 + vec3(-phase * 0.04, phase * 0.025, 0.0));
  float oblique = sin(
    longitude * 11.0 + sign(latitude) * latitude * 25.0 + streakWarp * 4.2 - phase * 0.42
  );
  float streakGrain = fbm(direction * vec3(16.0, 8.0, 16.0) + streakWarp * 1.7);
  float streaks = oblique * 0.28 + (streakGrain - 0.5) * 0.46;

  float streakMix = smoothstep(0.38, 0.76, latitudeSine);
  float poleFade = smoothstep(0.04, 0.24, latitudeCosine);
  float polarSpiral = sin(
    longitude * 2.0 + sign(latitude) * latitude * 9.0 + streakWarp * 3.0 + phase * 0.18
  ) * smoothstep(0.76, 0.94, latitudeSine) * 0.12;
  return (mix(cellular, streaks, streakMix) + polarSpiral) * poleFade * uCloudDetail;
}

float henyeyGreenstein(float cosineTheta, float asymmetry) {
  float g2 = asymmetry * asymmetry;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * asymmetry * cosineTheta, 0.001), 1.5);
}

bool planetShadowsPoint(vec3 point, vec3 lightDirection) {
  vec2 hit = raySphere(point + lightDirection * 0.001, lightDirection, VENUS_RADIUS);
  return hit.y > 0.0;
}

vec4 integrateUpperHaze(
  vec3 rayOrigin,
  vec3 rayDirection,
  float startDistance,
  float endDistance,
  vec3 lightDirection,
  vec3 viewDirection
) {
  if (uUpperHaze <= 0.0001 || uOpticalDepth <= 0.0001 || endDistance <= startDistance) {
    return vec4(0.0);
  }

  float segmentLength = endDistance - startDistance;
  float stepLength = segmentLength / 8.0;
  float viewOpticalDepth = 0.0;
  vec3 scattering = vec3(0.0);
  float forwardCosine = dot(-lightDirection, viewDirection);
  float forwardPhase = uForwardScattering > 0.0001
    ? henyeyGreenstein(forwardCosine, 0.82) * uForwardScattering * 0.015
    : 0.0;
  float phaseAlignment = clamp(dot(lightDirection, viewDirection), -1.0, 1.0);
  float gloryPhase = exp(-pow((1.0 - phaseAlignment) / 0.045, 2.0)) *
    uGloryStrength * 0.07;
  vec3 aerosolColor = mix(
    vec3(1.04, 0.84, 0.56),
    vec3(1.08, 0.62, 0.24),
    clamp(uSulfurTint, 0.0, 1.0) * 0.72
  );

  for (int stepIndex = 0; stepIndex < 8; stepIndex += 1) {
    float distance = startDistance + (float(stepIndex) + 0.5) * stepLength;
    vec3 point = rayOrigin + rayDirection * distance;
    float normalizedHeight = clamp((length(point) - VENUS_RADIUS) / HAZE_THICKNESS, 0.0, 1.0);
    float density = exp(-normalizedHeight * 5.2) * (1.0 - smoothstep(0.82, 1.0, normalizedHeight));
    float normalizedStep = stepLength / HAZE_THICKNESS;
    float stepOpticalDepth = density * normalizedStep * uOpticalDepth * 0.72;
    vec3 localNormal = normalize(point);
    float lightCosine = dot(localNormal, lightDirection);
    float horizonPath = 1.0 / max(
      0.09,
      lightCosine + sqrt(max(lightCosine * lightCosine + normalizedHeight * 0.12, 0.0))
    );
    float sunOpticalDepth = density * horizonPath * uOpticalDepth * 0.16;
    float sunVisibility = planetShadowsPoint(point, lightDirection)
      ? 0.0
      : exp(-sunOpticalDepth);
    float sunwardIllumination = smoothstep(-0.08, 0.12, lightCosine);
    float aerosolPhase = 0.065 + forwardPhase + gloryPhase;
    float viewTransmittance = exp(-viewOpticalDepth);
    float scatterAmount = density * normalizedStep * uUpperHaze * 0.12;
    scattering += aerosolColor * aerosolPhase * scatterAmount *
      sunVisibility * sunwardIllumination * viewTransmittance;
    viewOpticalDepth += stepOpticalDepth;
  }

  return vec4(scattering, viewOpticalDepth);
}

vec3 filmic(vec3 color) {
  color = max(color, 0.0);
  return clamp(
    (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14),
    0.0,
    1.0
  );
}

float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
  if (uSourceReady < 0.5) {
    fragColor = vec4(0.0);
    return;
  }

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 position = (vUv * 2.0 - 1.0) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0));
  float shellDistance = length(position) / HAZE_RADIUS;
  float shellEdge = max(fwidth(shellDistance), 0.0005);
  float shellCoverage = 1.0 - smoothstep(1.0 - shellEdge, 1.0 + shellEdge, shellDistance);
  if (shellCoverage <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 rayOrigin = vec3(position, CAMERA_DISTANCE);
  vec3 rayDirection = vec3(0.0, 0.0, -1.0);
  vec3 viewDirection = -rayDirection;
  vec2 shellHit = raySphere(rayOrigin, rayDirection, HAZE_RADIUS);
  vec2 bodyHit = raySphere(rayOrigin, rayDirection, VENUS_RADIUS);
  bool hitsBody = bodyHit.x > 0.0;
  float hazeStart = max(shellHit.x, 0.0);
  float hazeEnd = hitsBody ? bodyHit.x : shellHit.y;
  vec4 haze = integrateUpperHaze(
    rayOrigin,
    rayDirection,
    hazeStart,
    hazeEnd,
    uSunDirection,
    viewDirection
  );

  vec3 linearColor = haze.rgb;
  float bodyCoverage = 0.0;
  if (hitsBody) {
    float bodyDistance = length(position) / VENUS_RADIUS;
    float bodyEdge = max(fwidth(bodyDistance), 0.0005);
    bodyCoverage = 1.0 - smoothstep(1.0 - bodyEdge, 1.0 + bodyEdge, bodyDistance);
    vec3 surfacePoint = rayOrigin + rayDirection * bodyHit.x;
    vec3 normal = normalize(surfacePoint);
    vec3 cloudDirection = advectedCloudDirection(orientedCloudDirection(normal));
    float sourceStructure = sampleEquirectangular(uCloudStructureTexture, cloudDirection).r;
    float latitude = asin(clamp(cloudDirection.y, -1.0, 1.0));
    float latitudeSine = abs(sin(latitude));
    float morphology = (sourceStructure - 0.5) * 2.0 * uCloudContrast;
    float detail = proceduralCloudDetail(cloudDirection);
    float brightHood = smoothstep(0.68, 0.86, latitudeSine) *
      (1.0 - smoothstep(0.93, 0.995, latitudeSine)) * 0.08;
    float darkPolarRing = exp(-pow((latitudeSine - 0.94) / 0.035, 2.0)) * -0.045;
    float cloudValue = morphology * 1.25 + detail * 1.15 + brightHood + darkPolarRing;

    vec3 neutralCloud = vec3(1.02, 0.91, 0.72);
    vec3 sulfurCloud = vec3(1.07, 0.73, 0.34);
    vec3 cloudColor = mix(
      neutralCloud,
      sulfurCloud,
      clamp(uSulfurTint, 0.0, 1.0) * 0.62
    );
    cloudColor *= 1.0 + cloudValue;
    cloudColor += max(-cloudValue, 0.0) * vec3(0.015, -0.018, -0.035);

    float viewCosine = max(dot(normal, viewDirection), 0.0);
    float incident = dot(normal, uSunDirection);
    float dayVisibility = smoothstep(-0.055, 0.095, incident);
    float incidentCosine = max(incident, 0.0);
    float lommelSeeliger = min(
      (2.0 * incidentCosine) / max(incidentCosine + viewCosine, 0.0001),
      1.35
    );
    float multipleScattering = pow(incidentCosine, 0.43);
    float reflectedLight = mix(multipleScattering, lommelSeeliger, 0.31);
    float phaseAlignment = clamp(dot(uSunDirection, viewDirection), -1.0, 1.0);
    float broadBackscatter = 0.82 + 0.18 * pow(max(phaseAlignment, 0.0), 2.0);
    float nearFullPhase = exp(-pow((1.0 - phaseAlignment) / 0.055, 2.0));
    float oppositionSurge = 1.0 + nearFullPhase * uGloryStrength * 0.32;
    float lighting = mix(
      0.0015,
      reflectedLight * oppositionSurge * broadBackscatter,
      dayVisibility
    );
    vec3 bodyColor = cloudColor * lighting;
    bodyColor = bodyColor * exp(-haze.a) + haze.rgb;
    linearColor = mix(linearColor, bodyColor, bodyCoverage);
  }

  linearColor = filmic(linearColor * uExposure);
  linearColor = pow(linearColor, vec3(1.0 / 2.2));
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  linearColor = clamp(linearColor + dither, 0.0, 1.0);
  float hazeAlpha = max(1.0 - exp(-haze.a), max(haze.r, max(haze.g, haze.b)));
  float alpha = mix(hazeAlpha, 1.0, bodyCoverage) * shellCoverage;
  fragColor = vec4(linearColor * shellCoverage, alpha);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Venusian shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Venusian shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create Venusian shader program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown Venusian shader link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Unable to create Venusian cloud texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([128, 128, 128, 255]),
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.generateMipmap(gl.TEXTURE_2D)
  return texture
}

function getUniformLocation(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name)
  if (!location) throw new Error(`Unable to locate Venusian uniform: ${name}`)
  return location
}

function createResources(gl: WebGL2RenderingContext): VenusianResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Venusian vertex array')
  const program = createProgram(gl)
  const resources = {
    cloudStructureTexture: createTexture(gl),
    program,
    uniforms: {
      axialTilt: getUniformLocation(gl, program, 'uAxialTilt'),
      cloudContrast: getUniformLocation(gl, program, 'uCloudContrast'),
      cloudDetail: getUniformLocation(gl, program, 'uCloudDetail'),
      cloudStructureTexture: getUniformLocation(gl, program, 'uCloudStructureTexture'),
      exposure: getUniformLocation(gl, program, 'uExposure'),
      flowSpeed: getUniformLocation(gl, program, 'uFlowSpeed'),
      flowStrength: getUniformLocation(gl, program, 'uFlowStrength'),
      forwardScattering: getUniformLocation(gl, program, 'uForwardScattering'),
      gloryStrength: getUniformLocation(gl, program, 'uGloryStrength'),
      longitudeOffset: getUniformLocation(gl, program, 'uLongitudeOffset'),
      opticalDepth: getUniformLocation(gl, program, 'uOpticalDepth'),
      pointer: getUniformLocation(gl, program, 'uPointer'),
      resolution: getUniformLocation(gl, program, 'uResolution'),
      sourceReady: getUniformLocation(gl, program, 'uSourceReady'),
      sulfurTint: getUniformLocation(gl, program, 'uSulfurTint'),
      sunDirection: getUniformLocation(gl, program, 'uSunDirection'),
      yaw: getUniformLocation(gl, program, 'uYaw'),
      time: getUniformLocation(gl, program, 'uTime'),
      upperHaze: getUniformLocation(gl, program, 'uUpperHaze'),
    },
    vertexArray,
  }
  gl.bindVertexArray(vertexArray)
  return resources
}

function deleteResources(gl: WebGL2RenderingContext, resources: VenusianResources): void {
  gl.deleteTexture(resources.cloudStructureTexture)
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: TexImageSource,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image)
  gl.generateMipmap(gl.TEXTURE_2D)
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic') as AnisotropyExtension | null
  if (anisotropy) {
    const maximum = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
    gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(maximum, 8))
  }
}

function createVenusianRenderer(
  canvas: HTMLCanvasElement,
  source: VenusianOrbSource,
): CanvasRenderer<VenusianFrameSettings> | null {
  const context = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
  })
  if (!context) return null
  const gl: WebGL2RenderingContext = context

  let contextLost = false
  let disposed = false
  let hasSource = false
  let longitudeOffset = 0
  let sourceGeneration = 0
  let resources = createResources(gl)
  let startTime = performance.now()
  let lastTime = startTime
  const pointer = { currentX: 0, currentY: 0, targetX: 0, targetY: 0, velocityX: 0, velocityY: 0 }

  function uploadSource(): void {
    if (disposed || contextLost) return
    const venus = source.render()
    if (!venus) {
      hasSource = false
      return
    }

    const previousFlip = Boolean(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL))
    const previousPremultiply = Boolean(gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL))
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    uploadTexture(gl, resources.cloudStructureTexture, venus.cloudStructure)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
    hasSource = true
    longitudeOffset = ((venus.longitudeOffsetDegrees ?? 0) * Math.PI) / 180
  }

  function refreshSource(): void {
    const generation = sourceGeneration
    uploadSource()
    void source.ready?.().then(
      () => {
        if (generation === sourceGeneration) uploadSource()
      },
      () => undefined,
    )
  }

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

  function updatePointer(delta: number, enabled: boolean): void {
    if (!enabled) {
      pointer.targetX = 0
      pointer.targetY = 0
    }
    const stiffness = 42
    const damping = 11
    pointer.velocityX += (pointer.targetX - pointer.currentX) * stiffness * delta
    pointer.velocityY += (pointer.targetY - pointer.currentY) * stiffness * delta
    const decay = Math.exp(-damping * delta)
    pointer.velocityX *= decay
    pointer.velocityY *= decay
    pointer.currentX += pointer.velocityX * delta
    pointer.currentY += pointer.velocityY * delta
  }

  function render(timestamp: number, settings: VenusianFrameSettings): void {
    if (contextLost) return
    const elapsed = (timestamp - startTime) / 1000
    const delta = Math.min((timestamp - lastTime) / 1000, 0.05)
    lastTime = timestamp
    updatePointer(delta, settings.lean)
    const azimuth = (settings.sunAzimuth * Math.PI) / 180
    const elevation = (settings.sunElevation * Math.PI) / 180
    const elevationCosine = Math.cos(elevation)
    const sunDirection = [
      Math.sin(azimuth) * elevationCosine,
      Math.sin(elevation),
      Math.cos(azimuth) * elevationCosine,
    ] as const

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.cloudStructureTexture)
    const { uniforms } = resources
    gl.uniform1i(uniforms.cloudStructureTexture, 0)
    gl.uniform1f(uniforms.axialTilt, (settings.axialTilt * Math.PI) / 180)
    gl.uniform1f(uniforms.cloudContrast, settings.cloudContrast)
    gl.uniform1f(uniforms.cloudDetail, settings.cloudDetail)
    gl.uniform1f(uniforms.exposure, settings.exposure)
    gl.uniform1f(uniforms.flowSpeed, settings.flowSpeed)
    gl.uniform1f(uniforms.flowStrength, settings.flowStrength)
    gl.uniform1f(uniforms.forwardScattering, settings.forwardScattering)
    gl.uniform1f(uniforms.gloryStrength, settings.gloryStrength)
    gl.uniform1f(uniforms.longitudeOffset, longitudeOffset)
    gl.uniform1f(uniforms.opticalDepth, settings.opticalDepth)
    gl.uniform2f(uniforms.pointer, pointer.currentX, pointer.currentY)
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
    gl.uniform1f(uniforms.sourceReady, hasSource ? 1 : 0)
    gl.uniform1f(uniforms.sulfurTint, settings.sulfurTint)
    gl.uniform3f(uniforms.sunDirection, ...sunDirection)
    gl.uniform1f(uniforms.yaw, ((settings.yaw + elapsed * settings.spin) * Math.PI) / 180)
    gl.uniform1f(uniforms.time, elapsed)
    gl.uniform1f(uniforms.upperHaze, settings.upperHaze)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  function handlePointerMove(event: PointerEvent): void {
    const bounds = canvas.getBoundingClientRect()
    pointer.targetX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    pointer.targetY = 1 - ((event.clientY - bounds.top) / bounds.height) * 2
  }

  function handlePointerLeave(): void {
    pointer.targetX = 0
    pointer.targetY = 0
  }

  function handleContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
  }

  function handleContextRestored(): void {
    contextLost = false
    sourceGeneration += 1
    resources = createResources(gl)
    hasSource = false
    longitudeOffset = 0
    uploadSource()
    startTime = performance.now()
    lastTime = startTime
    resize()
  }

  const resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(canvas)
  window.addEventListener('resize', resize)
  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerleave', handlePointerLeave)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  try {
    refreshSource()
    resize()
  } catch (error) {
    disposed = true
    sourceGeneration += 1
    resizeObserver.disconnect()
    window.removeEventListener('resize', resize)
    canvas.removeEventListener('pointermove', handlePointerMove)
    canvas.removeEventListener('pointerleave', handlePointerLeave)
    canvas.removeEventListener('webglcontextlost', handleContextLost)
    canvas.removeEventListener('webglcontextrestored', handleContextRestored)
    if (!contextLost) deleteResources(gl, resources)
    throw error
  }

  return {
    render,
    dispose(): void {
      disposed = true
      sourceGeneration += 1
      resizeObserver.disconnect()
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost) deleteResources(gl, resources)
    },
  }
}

export function VenusianOrbEffect({
  axialTilt = -3,
  className,
  cloudContrast = 0.3,
  cloudDetail = 0.22,
  exposure = 1.08,
  flowSpeed = 0.045,
  flowStrength = 0.7,
  forwardScattering = 0.72,
  gloryStrength = 0.18,
  lean = true,
  opticalDepth = 0.72,
  spin = -1.5,
  source,
  style,
  sulfurTint = 0.72,
  sunAzimuth = -52,
  sunElevation = 9,
  yaw = 0,
  upperHaze = 0.46,
}: VenusianOrbEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameSettings: VenusianFrameSettings = {
    axialTilt,
    cloudContrast,
    cloudDetail,
    exposure,
    flowSpeed,
    flowStrength,
    forwardScattering,
    gloryStrength,
    lean,
    opticalDepth,
    spin,
    sulfurTint,
    sunAzimuth,
    sunElevation,
    yaw,
    upperHaze,
  }

  useCanvasRenderer(canvasRef, frameSettings, source, createVenusianRenderer)

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', touchAction: 'none', width: '100%', ...style }}
    />
  )
}
