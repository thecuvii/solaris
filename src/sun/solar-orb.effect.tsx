'use client'

import { OrbCanvas } from '../internal/orb-canvas'
import type { OrbRendererSpec, OrbSource } from '../internal/orb-renderer'
import { getUniformLocations, type UniformLocations } from '../internal/uniforms'
import {
  clamp,
  COMPOSITION_GLSL,
  COMPOSITION_UNIFORM_NAMES,
  createProgram,
  createTexture,
  createVertexArray,
  degreesToRadians,
  withUnpackState,
} from '../internal/webgl'
import type { OrbCanvasProps, OrbPoseProps } from '../orb'

export type SolarDataPlane = {
  /** Straight RGBA8: sRGB coded-color observation in RGB and coverage in alpha. */
  data: Uint8Array
  height: number
  width: number
}

export type SolarOrbFrame = {
  /** Normalized center in the data plane's top-left-origin pixel convention. */
  diskCenter: readonly [x: number, y: number]
  /** Disk radius normalized by the square data-plane width. */
  diskRadius: number
  observation: SolarDataPlane
}

export type SolarOrbSource = OrbSource<SolarOrbFrame>

export type SolarOrbEffectProps = OrbCanvasProps &
  Omit<OrbPoseProps, 'tilt'> & {
    /** Boost on bright, locally contrasted active regions. Range 0–2. @default 0.28 */
    activeRegionGain?: number
    /** Luminance power curve around mid-grey. Range 0.5–1.8. @default 1.06 */
    contrast?: number
    /** Linear gain before display encoding. Range 0–2. @default 1 */
    exposure?: number
    /** Darkening of filaments and other locally dark structure. Range 0–1.5. @default 0.42 */
    filamentDepth?: number
    /** Amplitude of the animated plasma flow warp in source texels. 0 disables it. Range 0–6. @default 1.6 */
    flowAmount?: number
    /** Speed multiplier for the flow warp. 0 freezes it. Range 0–2. @default 1 */
    flowSpeed?: number
    /** Off-limb emission gain: below 1 fades the corona alpha, above 1 brightens it. Range 0–2. @default 1 */
    limbEmission?: number
    /** Chroma of the coded colour. 1 preserves the observation tint. Range 0–1.6. @default 1.04 */
    saturation?: number
    source: SolarOrbSource
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uActiveRegionGain',
  'uContrast',
  'uDiskCenter',
  'uDiskRadius',
  'uExposure',
  'uFilamentDepth',
  'uFlowAmount',
  'uFlowSpeed',
  'uLimbEmission',
  'uObservationTexture',
  'uPointer',
  'uRoll',
  'uSaturation',
  'uSourceReady',
  'uTime',
] as const

type UniformName = (typeof UNIFORM_NAMES)[number]

type SolarResources = {
  /** Registration of the uploaded observation; defaults until a source arrives. */
  diskCenter: readonly [number, number]
  diskRadius: number
  observationTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UniformLocations<UniformName>
  vertexArray: WebGLVertexArrayObject
}

type SolarOrbSettings = {
  activeRegionGain: number
  contrast: number
  exposure: number
  filamentDepth: number
  flowAmount: number
  flowSpeed: number
  lean: boolean
  limbEmission: number
  saturation: number
  spin: number
  yaw: number
}

const OBSERVATION_SIZE = 1024

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform float uActiveRegionGain;
uniform float uContrast;
uniform vec2 uDiskCenter;
uniform float uDiskRadius;
uniform float uExposure;
uniform float uFilamentDepth;
uniform float uFlowAmount;
uniform float uFlowSpeed;
uniform float uLimbEmission;
uniform sampler2D uObservationTexture;
uniform vec2 uPointer;
uniform float uRoll;
uniform float uSaturation;
uniform float uSourceReady;
uniform float uTime;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float TAU = 6.283185307179586;
const float SOURCE_SIZE = 1024.0;
const float SCREEN_DISK_RADIUS = 0.72;
const float FLOW_PERIOD_SECONDS = 18.0;
const vec3 LUMINANCE = vec3(0.2126, 0.7152, 0.0722);

vec3 srgbToLinear(vec3 color) {
  vec3 low = color / 12.92;
  vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), color));
}

vec3 linearToSrgb(vec3 color) {
  color = max(color, 0.0);
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), color));
}

vec3 sampleLinear(vec2 uv, float lod) {
  return srgbToLinear(textureLod(uObservationTexture, uv, lod).rgb);
}

float flowPotentialOne(vec2 position) {
  float ax = position.x * 4.7 + 0.35;
  float ay = position.y * 3.9 - 0.82;
  float bx = position.x * 7.1 - 1.1;
  float by = position.y * 5.3 + 0.44;
  return (
    sin(ax) * sin(ay) +
    sin(bx) * sin(by) * 0.46
  ) / 8.4;
}

vec2 flowFieldOne(vec2 position) {
  float ax = position.x * 4.7 + 0.35;
  float ay = position.y * 3.9 - 0.82;
  float bx = position.x * 7.1 - 1.1;
  float by = position.y * 5.3 + 0.44;
  vec2 first = vec2(
    3.9 * sin(ax) * cos(ay),
    -4.7 * cos(ax) * sin(ay)
  );
  vec2 second = vec2(
    5.3 * sin(bx) * cos(by),
    -7.1 * cos(bx) * sin(by)
  );
  return (first + second * 0.46) / 8.4;
}

float flowPotentialTwo(vec2 position) {
  float ax = position.x * 3.7 - 0.56;
  float ay = position.y * 6.1 + 1.24;
  float bx = position.x * 6.7 + 0.92;
  float by = position.y * 4.3 - 1.42;
  return (
    sin(ax) * sin(ay) +
    sin(bx) * sin(by) * 0.52
  ) / 8.8;
}

vec2 flowFieldTwo(vec2 position) {
  float ax = position.x * 3.7 - 0.56;
  float ay = position.y * 6.1 + 1.24;
  float bx = position.x * 6.7 + 0.92;
  float by = position.y * 4.3 - 1.42;
  vec2 first = vec2(
    6.1 * sin(ax) * cos(ay),
    -3.7 * cos(ax) * sin(ay)
  );
  vec2 second = vec2(
    4.3 * sin(bx) * cos(by),
    -6.7 * cos(bx) * sin(by)
  );
  return (first + second * 0.52) / 8.8;
}

void flowMaskAndGradient(vec2 position, out float mask, out vec2 gradient) {
  float radius = length(position);
  if (radius <= 0.82) {
    mask = 1.0;
    gradient = vec2(0.0);
    return;
  }
  if (radius >= 0.97) {
    mask = 0.0;
    gradient = vec2(0.0);
    return;
  }

  float progress = (radius - 0.82) / (0.97 - 0.82);
  mask = 1.0 - progress * progress * (3.0 - 2.0 * progress);
  float radialDerivative = -6.0 * progress * (1.0 - progress) / (0.97 - 0.82);
  gradient = radialDerivative * position / max(radius, 0.0001);
}

float sourceLod(vec2 uv) {
  vec2 derivativeX = dFdx(uv) * SOURCE_SIZE;
  vec2 derivativeY = dFdy(uv) * SOURCE_SIZE;
  float footprint = max(length(derivativeX), length(derivativeY));
  return clamp(log2(max(footprint, 1.0)), 0.0, 8.0);
}

float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
  if (uSourceReady < 0.5) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 position = compositionPosition();
  // In-plane roll (yaw + spin + pointer) and a subtle pointer parallax shift.
  float rollSine = sin(uRoll);
  float rollCosine = cos(uRoll);
  position = vec2(
    rollCosine * position.x - rollSine * position.y,
    rollSine * position.x + rollCosine * position.y
  );
  position += uPointer * 0.02;
  vec2 sourceUv = uDiskCenter + vec2(position.x, -position.y) *
    (uDiskRadius / SCREEN_DISK_RADIUS);
  if (
    sourceUv.x <= 0.0 || sourceUv.x >= 1.0 ||
    sourceUv.y <= 0.0 || sourceUv.y >= 1.0
  ) {
    fragColor = vec4(0.0);
    return;
  }

  float baseLod = sourceLod(sourceUv);
  vec4 sourceSample = textureLod(uObservationTexture, sourceUv, baseLod);
  float alpha = sourceSample.a;
  if (alpha <= 0.5 / 255.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 diskPosition = (sourceUv - uDiskCenter) / uDiskRadius;
  float flowMask;
  vec2 flowMaskGradient;
  flowMaskAndGradient(diskPosition, flowMask, flowMaskGradient);
  vec2 maskCurl = vec2(flowMaskGradient.y, -flowMaskGradient.x);
  vec2 maskedFlowOne =
    flowMask * flowFieldOne(diskPosition) +
    flowPotentialOne(diskPosition) * maskCurl;
  vec2 maskedFlowTwo =
    flowMask * flowFieldTwo(diskPosition) +
    flowPotentialTwo(diskPosition) * maskCurl;
  float flowPhase = TAU * uTime * uFlowSpeed / FLOW_PERIOD_SECONDS;
  vec2 flow =
    cos(flowPhase) * maskedFlowOne +
    sin(flowPhase) * maskedFlowTwo;
  vec2 warpedUv = sourceUv + flow * (uFlowAmount / SOURCE_SIZE);

  float lowPassLod = min(baseLod + 2.25, 9.0);
  vec3 fixedLowPass = sampleLinear(sourceUv, lowPassLod);
  vec3 warpedBandPass =
    sampleLinear(warpedUv, baseLod) - sampleLinear(warpedUv, lowPassLod);
  vec3 color = max(fixedLowPass + warpedBandPass, 0.0);

  float offLimb = smoothstep(
    uDiskRadius - 2.0 / SOURCE_SIZE,
    uDiskRadius + 2.0 / SOURCE_SIZE,
    length(sourceUv - uDiskCenter)
  );
  float onDisk = 1.0 - offLimb;
  float broadLod = min(baseLod + 4.0, 9.0);
  float localLuminance = max(dot(sampleLinear(sourceUv, broadLod), LUMINANCE), 0.002);
  float luminance = max(dot(color, LUMINANCE), 0.0);

  float relativeDarkness = 1.0 - luminance / localLuminance;
  float filament = smoothstep(0.16, 0.68, relativeDarkness) * onDisk;
  color *= 1.0 - filament * uFilamentDepth * 0.52;

  luminance = max(dot(color, LUMINANCE), 0.0);
  float relativeBrightness = luminance / localLuminance;
  float activeRegion =
    smoothstep(0.24, 0.72, luminance) *
    smoothstep(1.12, 2.6, relativeBrightness) *
    onDisk;
  color *= 1.0 + activeRegion * uActiveRegionGain * 0.72;

  luminance = max(dot(color, LUMINANCE), 0.00001);
  float contrastedLuminance = 0.18 * pow(luminance / 0.18, uContrast);
  color *= contrastedLuminance / luminance;
  luminance = dot(color, LUMINANCE);
  color = mix(vec3(luminance), color, uSaturation);
  color *= uExposure;

  float limbAlphaGain = min(uLimbEmission, 1.0);
  alpha *= mix(1.0, limbAlphaGain, offLimb);
  color *= mix(1.0, max(uLimbEmission, 1.0), offLimb);
  if (alpha <= 0.5 / 255.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 displayColor = clamp(linearToSrgb(color), 0.0, 1.0);
  if (uExposure > 0.0) {
    float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    displayColor = clamp(displayColor + dither, 0.0, 1.0);
  }
  fragColor = vec4(displayColor * alpha, alpha);
}
`

function downsampleAlphaAware(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
): { data: Uint8Array; height: number; width: number } {
  const width = Math.max(sourceWidth >> 1, 1)
  const height = Math.max(sourceHeight >> 1, 1)
  const data = new Uint8Array(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let alphaSum = 0
      let redSum = 0
      let greenSum = 0
      let blueSum = 0
      let hiddenRedSum = 0
      let hiddenGreenSum = 0
      let hiddenBlueSum = 0
      let sampleCount = 0

      for (let offsetY = 0; offsetY < 2; offsetY += 1) {
        const sourceY = Math.min(y * 2 + offsetY, sourceHeight - 1)
        for (let offsetX = 0; offsetX < 2; offsetX += 1) {
          const sourceX = Math.min(x * 2 + offsetX, sourceWidth - 1)
          const sourceOffset = (sourceY * sourceWidth + sourceX) * 4
          const alpha = source[sourceOffset + 3]
          alphaSum += alpha
          redSum += source[sourceOffset] * alpha
          greenSum += source[sourceOffset + 1] * alpha
          blueSum += source[sourceOffset + 2] * alpha
          hiddenRedSum += source[sourceOffset]
          hiddenGreenSum += source[sourceOffset + 1]
          hiddenBlueSum += source[sourceOffset + 2]
          sampleCount += 1
        }
      }

      const outputOffset = (y * width + x) * 4
      const colorDivisor = alphaSum > 0 ? alphaSum : sampleCount
      data[outputOffset] = Math.round((alphaSum > 0 ? redSum : hiddenRedSum) / colorDivisor)
      data[outputOffset + 1] = Math.round((alphaSum > 0 ? greenSum : hiddenGreenSum) / colorDivisor)
      data[outputOffset + 2] = Math.round((alphaSum > 0 ? blueSum : hiddenBlueSum) / colorDivisor)
      data[outputOffset + 3] = Math.round(alphaSum / sampleCount)
    }
  }

  return { data, height, width }
}

/**
 * Upload the observation with a hand-built, alpha-aware mip chain so the
 * off-limb coverage edge does not bleed black into the corona at coarse LODs.
 */
function uploadObservation(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  plane: SolarDataPlane,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  let data = plane.data
  let height = plane.height
  let level = 0
  let width = plane.width

  while (true) {
    gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
    if (width === 1 && height === 1) break
    const next = downsampleAlphaAware(data, width, height)
    data = next.data
    height = next.height
    width = next.width
    level += 1
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, level)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
}

function validateObservation(plane: SolarDataPlane): void {
  if (
    plane.width !== OBSERVATION_SIZE ||
    plane.height !== OBSERVATION_SIZE ||
    plane.data.length !== plane.width * plane.height * 4
  ) {
    throw new Error('Invalid Solar AIA 304 observation data plane')
  }
}

function validateRegistration(frame: SolarOrbFrame): void {
  const [centerX, centerY] = frame.diskCenter
  const maximumRadius = Math.min(centerX, centerY, 1 - centerX, 1 - centerY)
  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(frame.diskRadius) ||
    centerX < 0 ||
    centerX > 1 ||
    centerY < 0 ||
    centerY > 1 ||
    frame.diskRadius <= 0 ||
    frame.diskRadius > maximumRadius
  ) {
    throw new Error('Invalid Solar observation disk registration')
  }
}

const spec: OrbRendererSpec<SolarResources, SolarOrbSettings, SolarOrbFrame> = {
  label: 'Sun',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Sun')
    return {
      diskCenter: [0.5, 0.5],
      diskRadius: 0.4,
      observationTexture: createTexture(gl, 'Sun observation', {
        minFilter: gl.LINEAR,
        placeholder: [0, 0, 0, 0],
        wrapS: gl.CLAMP_TO_EDGE,
      }),
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Sun'),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteTexture(resources.observationTexture)
    gl.deleteProgram(resources.program)
    gl.deleteVertexArray(resources.vertexArray)
  },
  upload(gl, resources, frame) {
    validateObservation(frame.observation)
    validateRegistration(frame)
    // Rows are tightly packed RGBA8.
    withUnpackState(gl, { alignment: 1, flipY: false, premultiplyAlpha: false }, () => {
      uploadObservation(gl, resources.observationTexture, frame.observation)
    })
    resources.diskCenter = frame.diskCenter
    resources.diskRadius = frame.diskRadius
  },
  isAnimated(settings) {
    return (settings.flowAmount > 0 && settings.flowSpeed > 0) || settings.spin !== 0
  },
  render(gl, resources, frame) {
    const { composition, elapsed, hasSource, pointerX, pointerY, settings } = frame
    const { uniforms } = resources

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.observationTexture)
    gl.uniform1i(uniforms.uObservationTexture, 0)

    gl.uniform1f(uniforms.uActiveRegionGain, clamp(settings.activeRegionGain, 0, 2))
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uContrast, clamp(settings.contrast, 0.5, 1.8))
    gl.uniform2f(uniforms.uDiskCenter, resources.diskCenter[0], resources.diskCenter[1])
    gl.uniform1f(uniforms.uDiskRadius, resources.diskRadius)
    gl.uniform1f(uniforms.uExposure, clamp(settings.exposure, 0, 2))
    gl.uniform1f(uniforms.uFilamentDepth, clamp(settings.filamentDepth, 0, 1.5))
    gl.uniform1f(uniforms.uFlowAmount, clamp(settings.flowAmount, 0, 6))
    gl.uniform1f(uniforms.uFlowSpeed, clamp(settings.flowSpeed, 0, 2))
    gl.uniform1f(uniforms.uLimbEmission, clamp(settings.limbEmission, 0, 2))
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(
      uniforms.uRoll,
      degreesToRadians(settings.yaw + elapsed * settings.spin + pointerX * 3),
    )
    gl.uniform1f(uniforms.uSaturation, clamp(settings.saturation, 0, 1.6))
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform1f(uniforms.uTime, elapsed)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function SolarOrbEffect({
  activeRegionGain = 0.28,
  className,
  composition,
  contrast = 1.06,
  exposure = 1,
  filamentDepth = 0.42,
  flowAmount = 1.6,
  flowSpeed = 1,
  lean = true,
  limbEmission = 1,
  onError,
  paused,
  saturation = 1.04,
  source,
  spin = 0,
  style,
  viewport,
  yaw = 0,
}: SolarOrbEffectProps) {
  const settings: SolarOrbSettings = {
    activeRegionGain,
    contrast,
    exposure,
    filamentDepth,
    flowAmount,
    flowSpeed,
    lean,
    limbEmission,
    saturation,
    spin,
    yaw,
  }

  return (
    <OrbCanvas
      className={className}
      composition={composition}
      lean={lean}
      onError={onError}
      paused={paused}
      settings={settings}
      source={source}
      spec={spec}
      style={style}
      viewport={viewport}
    />
  )
}
