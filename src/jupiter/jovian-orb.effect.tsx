'use client'

// Requires: react

import { useRef, type CSSProperties } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

export type JovianOrbSource = {
  ready?: () => Promise<void>
  render: () => {
    albedo: TexImageSource
    grsCenter?: readonly [longitudeDegrees: number, latitudeDegrees: number]
    grsRadii?: readonly [longitudeDegrees: number, latitudeDegrees: number]
    longitudeOffsetDegrees?: number
  } | null
}

export type JovianOrbEffectProps = {
  className?: string
  cloudPhotometricMix?: number
  detailIntensity?: number
  detailScale?: number
  detailSpeed?: number
  exposure?: number
  jetStrength?: number
  limbHaze?: number
  oblateness?: number
  rotationSpeed?: number
  source: JovianOrbSource
  style?: CSSProperties
  sunAzimuth?: number
  sunElevation?: number
  surfaceRotation?: number
  vortexStrength?: number
}

type JovianResources = {
  albedoTexture: WebGLTexture
  program: WebGLProgram
  vertexArray: WebGLVertexArrayObject
}

type AnisotropyExtension = {
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
  TEXTURE_MAX_ANISOTROPY_EXT: number
}

type JovianFrameSettings = {
  cloudPhotometricMix: number
  detailIntensity: number
  detailScale: number
  detailSpeed: number
  exposure: number
  jetStrength: number
  limbHaze: number
  oblateness: number
  rotationSpeed: number
  sunAzimuth: number
  sunElevation: number
  surfaceRotation: number
  vortexStrength: number
}

const JUPITER_RADIUS = 0.82

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

uniform sampler2D uAlbedoTexture;
uniform float uCloudPhotometricMix;
uniform float uDetailIntensity;
uniform float uDetailScale;
uniform float uDetailSpeed;
uniform float uExposure;
uniform vec2 uGrsCenter;
uniform vec2 uGrsRadii;
uniform float uJetStrength;
uniform float uLimbHaze;
uniform float uLongitudeOffset;
uniform float uOblateness;
uniform vec2 uPointer;
uniform vec2 uResolution;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uSurfaceRotation;
uniform float uTime;
uniform float uVortexStrength;

out vec4 fragColor;

const float JUPITER_RADIUS = ${JUPITER_RADIUS.toFixed(2)};
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

vec2 rotate2d(vec2 value, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, sine, -sine, cosine) * value;
}

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

float wrapAngle(float angle) {
  return mod(angle + PI, TAU) - PI;
}

vec3 textureDirection(vec3 radialDirection) {
  vec3 tilted = rotateX(radialDirection, uPointer.y * 0.12);
  return rotateY(tilted, uLongitudeOffset + uSurfaceRotation + uPointer.x * 0.18);
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

float zonalWind(float latitude) {
  float normalizedLatitude = latitude / (0.5 * PI);
  float equatorialJet = 1.05 * exp(-normalizedLatitude * normalizedLatitude * 42.0);
  float alternatingJets = sin(latitude * 18.0 + 0.35) * 0.62 +
    sin(latitude * 34.0 - 0.7) * 0.2;
  float polarFalloff = pow(max(cos(latitude), 0.0), 0.45);
  return (equatorialJet + alternatingJets) * polarFalloff;
}

vec2 vortexCoordinates(float longitude, float latitude) {
  if (uGrsRadii.x <= 0.0001 || uGrsRadii.y <= 0.0001 || uVortexStrength <= 0.0) {
    return vec2(longitude, latitude);
  }

  float centerCosine = max(cos(uGrsCenter.y), 0.1);
  vec2 radii = vec2(uGrsRadii.x * centerCosine, uGrsRadii.y);
  vec2 delta = vec2(wrapAngle(longitude - uGrsCenter.x) * centerCosine, latitude - uGrsCenter.y);
  vec2 local = delta / radii;
  float radius = length(local);
  float influence = 1.0 - smoothstep(0.25, 1.65, radius);
  float angle = -uTime * uDetailSpeed * 4.8 * uVortexStrength * influence;
  vec2 warpedDelta = rotate2d(local, angle) * radii;
  return vec2(
    uGrsCenter.x + warpedDelta.x / centerCosine,
    uGrsCenter.y + warpedDelta.y
  );
}

float weatherDetail(float longitude, float latitude) {
  vec2 weather = vortexCoordinates(longitude, latitude);
  float advectedLongitude = weather.x +
    uTime * uDetailSpeed * uJetStrength * zonalWind(weather.y);
  float scale = max(uDetailScale, 0.05);

  vec3 broadDomain = vec3(
    cos(advectedLongitude) * 2.4,
    sin(advectedLongitude) * 2.4,
    weather.y * 18.0 * scale
  );
  float broad = valueNoise(broadDomain);
  float warpedLatitude = weather.y + (broad - 0.5) * 0.028;

  vec3 filamentDomain = vec3(
    cos(advectedLongitude * 3.0) * 3.2,
    sin(advectedLongitude * 3.0) * 3.2,
    warpedLatitude * 58.0 * scale
  );
  float filament = valueNoise(filamentDomain);
  float micro = valueNoise(vec3(
    cos(advectedLongitude * 7.0) * 4.3,
    sin(advectedLongitude * 7.0) * 4.3,
    warpedLatitude * 108.0 * scale + broad * 2.0
  ));
  float strands = sin(warpedLatitude * 96.0 * scale + broad * 5.5 + filament * 3.0);
  float polarFade = smoothstep(0.04, 0.22, cos(weather.y));
  return ((filament - 0.5) * 0.82 + (micro - 0.5) * 0.28 + strands * 0.15) *
    polarFade;
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
  float polarRadius = JUPITER_RADIUS * (1.0 - clamp(uOblateness, 0.0, 0.2));
  vec2 ellipsoidPosition = vec2(position.x / JUPITER_RADIUS, position.y / polarRadius);
  float radialDistance = length(ellipsoidPosition);
  float edgeWidth = max(fwidth(radialDistance), 0.0005);
  float coverage = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, radialDistance);
  if (coverage <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  float depth = sqrt(max(1.0 - dot(ellipsoidPosition, ellipsoidPosition), 0.0));
  vec3 surfacePoint = vec3(
    ellipsoidPosition.x * JUPITER_RADIUS,
    ellipsoidPosition.y * polarRadius,
    depth * JUPITER_RADIUS
  );
  vec3 radialDirection = normalize(surfacePoint);
  vec3 geometricNormal = normalize(vec3(
    ellipsoidPosition.x / JUPITER_RADIUS,
    ellipsoidPosition.y / polarRadius,
    depth / JUPITER_RADIUS
  ));
  vec3 mappedDirection = textureDirection(radialDirection);
  vec3 albedo = sampleEquirectangular(uAlbedoTexture, mappedDirection).rgb;

  float longitude = atan(mappedDirection.x, mappedDirection.z);
  float latitude = asin(clamp(mappedDirection.y, -1.0, 1.0));
  float detail = weatherDetail(longitude, latitude) * uDetailIntensity;
  albedo *= 1.0 + detail;
  albedo += detail * vec3(0.045, 0.028, 0.012);

  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float viewCosine = max(dot(geometricNormal, viewDirection), 0.0);
  float incident = dot(geometricNormal, uSunDirection);
  float terminatorWidth = max(fwidth(incident) * 1.5, 0.0008);
  float dayVisibility = smoothstep(-terminatorWidth, terminatorWidth, incident);
  float incidentCosine = max(incident, 0.0);
  float lommelSeeliger = min(
    (2.0 * incidentCosine) / max(incidentCosine + viewCosine, 0.0001),
    1.25
  );
  float cloudPhotometry = mix(
    incidentCosine,
    lommelSeeliger,
    clamp(uCloudPhotometricMix, 0.0, 1.0)
  );
  float phase = max(dot(uSunDirection, viewDirection), 0.0);
  float backscatter = 1.0 + 0.14 * pow(phase, 4.0);
  float reflectedLight = cloudPhotometry * backscatter;
  float lighting = mix(0.004, reflectedLight, dayVisibility);

  vec3 linearColor = albedo * lighting;
  float limbPath = pow(1.0 - viewCosine, 4.0);
  float hazeVisibility = dayVisibility * smoothstep(-0.18, 0.32, incident);
  linearColor += vec3(0.88, 0.79, 0.67) * limbPath * hazeVisibility * uLimbHaze * 0.32;
  linearColor = filmic(linearColor * uExposure);
  linearColor = pow(linearColor, vec3(1.0 / 2.2));
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  linearColor = clamp(linearColor + dither, 0.0, 1.0);
  fragColor = vec4(linearColor * coverage, coverage);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Jovian shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Jovian shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create Jovian shader program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown Jovian shader link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Unable to create Jovian texture')
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
    new Uint8Array([255, 255, 255, 255]),
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.generateMipmap(gl.TEXTURE_2D)
  return texture
}

function createResources(gl: WebGL2RenderingContext): JovianResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Jovian vertex array')
  const resources = {
    albedoTexture: createTexture(gl),
    program: createProgram(gl),
    vertexArray,
  }
  gl.bindVertexArray(vertexArray)
  return resources
}

function deleteResources(gl: WebGL2RenderingContext, resources: JovianResources): void {
  gl.deleteTexture(resources.albedoTexture)
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: TexImageSource,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, image)
  gl.generateMipmap(gl.TEXTURE_2D)
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic') as AnisotropyExtension | null
  if (anisotropy) {
    const maximum = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
    gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(maximum, 8))
  }
}

function createJovianRenderer(
  canvas: HTMLCanvasElement,
  source: JovianOrbSource,
): CanvasRenderer<JovianFrameSettings> | null {
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
  let grsCenter = [0, 0] as [number, number]
  let grsRadii = [0, 0] as [number, number]
  let resources = createResources(gl)
  let startTime = performance.now()
  let lastTime = startTime
  const pointer = { currentX: 0, currentY: 0, targetX: 0, targetY: 0, velocityX: 0, velocityY: 0 }

  function uploadSource(): void {
    if (disposed || contextLost) return
    const clouds = source.render()
    if (!clouds) {
      hasSource = false
      return
    }

    const previousFlip = Boolean(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL))
    const previousPremultiply = Boolean(gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL))
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    uploadTexture(gl, resources.albedoTexture, clouds.albedo)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
    hasSource = true
    longitudeOffset = ((clouds.longitudeOffsetDegrees ?? 0) * Math.PI) / 180
    grsCenter = clouds.grsCenter
      ? [(clouds.grsCenter[0] * Math.PI) / 180, (clouds.grsCenter[1] * Math.PI) / 180]
      : [0, 0]
    grsRadii =
      clouds.grsCenter && clouds.grsRadii
        ? [(clouds.grsRadii[0] * Math.PI) / 180, (clouds.grsRadii[1] * Math.PI) / 180]
        : [0, 0]
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

  function updatePointer(delta: number): void {
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

  function render(timestamp: number, settings: JovianFrameSettings): void {
    if (contextLost) return
    resize()
    const elapsed = (timestamp - startTime) / 1000
    const delta = Math.min((timestamp - lastTime) / 1000, 0.05)
    lastTime = timestamp
    updatePointer(delta)
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
    gl.bindTexture(gl.TEXTURE_2D, resources.albedoTexture)
    gl.uniform1i(gl.getUniformLocation(resources.program, 'uAlbedoTexture'), 0)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uCloudPhotometricMix'),
      settings.cloudPhotometricMix,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uDetailIntensity'),
      settings.detailIntensity,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uDetailScale'), settings.detailScale)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uDetailSpeed'), settings.detailSpeed)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uExposure'), settings.exposure)
    gl.uniform2f(gl.getUniformLocation(resources.program, 'uGrsCenter'), ...grsCenter)
    gl.uniform2f(gl.getUniformLocation(resources.program, 'uGrsRadii'), ...grsRadii)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uJetStrength'), settings.jetStrength)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uLimbHaze'), settings.limbHaze)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uLongitudeOffset'), longitudeOffset)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uOblateness'), settings.oblateness)
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uPointer'),
      pointer.currentX,
      pointer.currentY,
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uResolution'),
      canvas.width,
      canvas.height,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uSourceReady'), hasSource ? 1 : 0)
    gl.uniform3f(gl.getUniformLocation(resources.program, 'uSunDirection'), ...sunDirection)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uSurfaceRotation'),
      (settings.surfaceRotation * Math.PI) / 180 + elapsed * settings.rotationSpeed,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uTime'), elapsed)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uVortexStrength'),
      settings.vortexStrength,
    )
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
    resources = createResources(gl)
    hasSource = false
    longitudeOffset = 0
    grsCenter = [0, 0]
    grsRadii = [0, 0]
    uploadSource()
    startTime = performance.now()
    lastTime = startTime
    resize()
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerleave', handlePointerLeave)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  uploadSource()
  void source.ready?.().then(uploadSource, () => undefined)
  resize()

  return {
    render,
    dispose(): void {
      disposed = true
      resizeObserver.disconnect()
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost) deleteResources(gl, resources)
    },
  }
}

export function JovianOrbEffect({
  className,
  cloudPhotometricMix = 0.35,
  detailIntensity = 0.11,
  detailScale = 1,
  detailSpeed = 0.055,
  exposure = 1.05,
  jetStrength = 0.65,
  limbHaze = 0.16,
  oblateness = 0.0649,
  rotationSpeed = 0.025,
  source,
  style,
  sunAzimuth = -32,
  sunElevation = 12,
  surfaceRotation = 0,
  vortexStrength = 0.42,
}: JovianOrbEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameSettings: JovianFrameSettings = {
    cloudPhotometricMix,
    detailIntensity,
    detailScale,
    detailSpeed,
    exposure,
    jetStrength,
    limbHaze,
    oblateness,
    rotationSpeed,
    sunAzimuth,
    sunElevation,
    surfaceRotation,
    vortexStrength,
  }
  useCanvasRenderer(canvasRef, frameSettings, source, createJovianRenderer)

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', touchAction: 'none', width: '100%', ...style }}
    />
  )
}
