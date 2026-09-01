'use client'

// Requires: react

import { useEffect, useRef, type CSSProperties } from 'react'

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

export type SolarOrbSource = {
  ready?: () => Promise<void>
  render: () => SolarOrbFrame | null
}

export type SolarOrbEffectProps = {
  activeRegionGain?: number
  className?: string
  contrast?: number
  exposure?: number
  filamentDepth?: number
  flowAmount?: number
  flowSpeed?: number
  limbEmission?: number
  saturation?: number
  source: SolarOrbSource
  style?: CSSProperties
}

type SolarResources = {
  observationTexture: WebGLTexture
  program: WebGLProgram
  vertexArray: WebGLVertexArrayObject
}

const OBSERVATION_SIZE = 1024

const VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}
`

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
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uSourceReady;
uniform float uTime;

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

  vec2 position = (2.0 * gl_FragCoord.xy - uResolution) /
    min(uResolution.x, uResolution.y);
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

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Solar shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Solar shader compile error'
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
    if (!program) throw new Error('Unable to create Solar shader program')
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Unknown Solar shader link error')
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

function createObservationTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Unable to create Solar observation texture')
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
    new Uint8Array([0, 0, 0, 0]),
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

function createResources(gl: WebGL2RenderingContext): SolarResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Solar vertex array')
  let observationTexture: WebGLTexture | null = null
  let program: WebGLProgram | null = null
  try {
    observationTexture = createObservationTexture(gl)
    program = createProgram(gl)
    gl.bindVertexArray(vertexArray)
    return { observationTexture, program, vertexArray }
  } catch (error) {
    if (observationTexture) gl.deleteTexture(observationTexture)
    if (program) gl.deleteProgram(program)
    gl.deleteVertexArray(vertexArray)
    throw error
  }
}

function deleteResources(gl: WebGL2RenderingContext, resources: SolarResources): void {
  gl.deleteTexture(resources.observationTexture)
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function SolarOrbEffect({
  activeRegionGain = 0.28,
  className,
  contrast = 1.06,
  exposure = 1,
  filamentDepth = 0.42,
  flowAmount = 1.6,
  flowSpeed = 1,
  limbEmission = 1,
  saturation = 1.04,
  source,
  style,
}: SolarOrbEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestRef = useRef({
    activeRegionGain,
    contrast,
    exposure,
    filamentDepth,
    flowAmount,
    flowSpeed,
    limbEmission,
    saturation,
  })
  latestRef.current = {
    activeRegionGain,
    contrast,
    exposure,
    filamentDepth,
    flowAmount,
    flowSpeed,
    limbEmission,
    saturation,
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const activeCanvas = canvas
    const context = activeCanvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
      stencil: false,
    })
    if (!context) return
    const gl: WebGL2RenderingContext = context

    let contextLost = false
    let diskCenter: readonly [number, number] = [0.5, 0.5]
    let diskRadius = 0.4
    let disposed = false
    let frameId = 0
    let hasSource = false
    let resources: SolarResources | null = createResources(gl)
    let sourceGeneration = 0
    let startTime = performance.now()

    function uploadSource(generation: number): void {
      if (disposed || contextLost || generation !== sourceGeneration || !resources) return
      const frame = source.render()
      if (!frame) {
        hasSource = false
        return
      }
      validateObservation(frame.observation)
      validateRegistration(frame)
      const previousAlignment = gl.getParameter(gl.UNPACK_ALIGNMENT) as number
      try {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        uploadObservation(gl, resources.observationTexture, frame.observation)
        gl.bindTexture(gl.TEXTURE_2D, null)
      } finally {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, previousAlignment)
      }
      diskCenter = frame.diskCenter
      diskRadius = frame.diskRadius
      hasSource = true
    }

    function refreshSource(): void {
      const generation = ++sourceGeneration
      uploadSource(generation)
      void source.ready?.().then(
        () => uploadSource(generation),
        () => undefined,
      )
    }

    function resize(): void {
      const bounds = activeCanvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio, 2)
      const width = Math.max(Math.round(bounds.width * dpr), 1)
      const height = Math.max(Math.round(bounds.height * dpr), 1)
      if (activeCanvas.width !== width || activeCanvas.height !== height) {
        activeCanvas.width = width
        activeCanvas.height = height
      }
    }

    function render(timestamp: number): void {
      if (disposed || contextLost || !resources) {
        frameId = 0
        return
      }
      frameId = requestAnimationFrame(render)
      const elapsed = (timestamp - startTime) / 1000
      const current = latestRef.current
      const activeResources = resources

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, activeCanvas.width, activeCanvas.height)
      gl.disable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(activeResources.program)
      gl.bindVertexArray(activeResources.vertexArray)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, activeResources.observationTexture)
      gl.uniform1i(gl.getUniformLocation(activeResources.program, 'uObservationTexture'), 0)

      const uniform1f = (name: string, value: number) => {
        gl.uniform1f(gl.getUniformLocation(activeResources.program, name), value)
      }
      uniform1f('uActiveRegionGain', clamp(current.activeRegionGain, 0, 2))
      uniform1f('uContrast', clamp(current.contrast, 0.5, 1.8))
      gl.uniform2f(
        gl.getUniformLocation(activeResources.program, 'uDiskCenter'),
        diskCenter[0],
        diskCenter[1],
      )
      uniform1f('uDiskRadius', diskRadius)
      uniform1f('uExposure', clamp(current.exposure, 0, 2))
      uniform1f('uFilamentDepth', clamp(current.filamentDepth, 0, 1.5))
      uniform1f('uFlowAmount', clamp(current.flowAmount, 0, 6))
      uniform1f('uFlowSpeed', clamp(current.flowSpeed, 0, 2))
      uniform1f('uLimbEmission', clamp(current.limbEmission, 0, 2))
      uniform1f('uSaturation', clamp(current.saturation, 0, 1.6))
      uniform1f('uSourceReady', hasSource ? 1 : 0)
      uniform1f('uTime', elapsed)
      gl.uniform2f(
        gl.getUniformLocation(activeResources.program, 'uResolution'),
        activeCanvas.width,
        activeCanvas.height,
      )
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindVertexArray(null)
    }

    function handleContextLost(event: Event): void {
      event.preventDefault()
      contextLost = true
      cancelAnimationFrame(frameId)
      frameId = 0
      resources = null
      hasSource = false
      sourceGeneration += 1
    }

    function handleContextRestored(): void {
      if (disposed) return
      contextLost = false
      resources = createResources(gl)
      startTime = performance.now()
      refreshSource()
      resize()
      if (frameId === 0) frameId = requestAnimationFrame(render)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(activeCanvas)
    window.addEventListener('resize', resize)
    activeCanvas.addEventListener('webglcontextlost', handleContextLost)
    activeCanvas.addEventListener('webglcontextrestored', handleContextRestored)
    try {
      refreshSource()
      resize()
      frameId = requestAnimationFrame(render)
    } catch (error) {
      disposed = true
      sourceGeneration += 1
      resizeObserver.disconnect()
      window.removeEventListener('resize', resize)
      activeCanvas.removeEventListener('webglcontextlost', handleContextLost)
      activeCanvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (resources) deleteResources(gl, resources)
      resources = null
      throw error
    }

    return () => {
      disposed = true
      sourceGeneration += 1
      cancelAnimationFrame(frameId)
      frameId = 0
      resizeObserver.disconnect()
      window.removeEventListener('resize', resize)
      activeCanvas.removeEventListener('webglcontextlost', handleContextLost)
      activeCanvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost && resources) deleteResources(gl, resources)
      resources = null
    }
  }, [source])

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', width: '100%', ...style }}
    />
  )
}
