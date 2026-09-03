'use client'

// Requires: react

import { useRef, type CSSProperties } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

export type MercurialOrbSource = {
  ready?: () => Promise<void>
  render: () => {
    albedo: TexImageSource
    /**
     * Byte-exact linear data in a north-at-row-0, planetocentric,
     * positive-east, -180..180 degree equirectangular image. RG is an
     * east/north/up tangent normal encoded octahedrally. BA is unsigned
     * normalized 16-bit height, high byte then low byte, mapped through
     * heightRangeMeters relative to Mercury's fixed 2,439,400 m datum.
     *
     * Use a static lossless HTMLImageElement without color metadata, ImageData,
     * or an ImageBitmap created with colorSpaceConversion:'none',
     * premultiplyAlpha:'none', and imageOrientation:'flipY'.
     * Canvas and video sources are not byte-preserving and are unsupported.
     */
    normalHeight: TexImageSource
    heightRangeMeters: readonly [minimum: number, maximum: number]
    /** Technical source-meridian alignment only. Omitted means zero. */
    longitudeOffsetDegrees?: number
  } | null
}

export type MercurialOrbEffectProps = {
  className?: string
  exposure?: number
  lean?: boolean
  microDetail?: number
  normalStrength?: number
  photometricStrength?: number
  reliefShadowStrength?: number
  source: MercurialOrbSource
  spin?: number
  style?: CSSProperties
  sunAzimuth?: number
  sunElevation?: number
  tilt?: number
  yaw?: number
}

type MercurialResources = {
  albedoTexture: WebGLTexture
  normalTexture: WebGLTexture
  program: WebGLProgram
  vertexArray: WebGLVertexArrayObject
}

type MercurialFrameSettings = {
  exposure: number
  lean: boolean
  microDetail: number
  normalStrength: number
  photometricStrength: number
  reliefShadowStrength: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  tilt: number
  yaw: number
}

type AnisotropyExtension = {
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
  TEXTURE_MAX_ANISOTROPY_EXT: number
}

const MERCURY_DATUM_RADIUS_METERS = 2_439_400
const MERCURY_RADIUS = 0.82

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
uniform float uExposure;
uniform float uHeightMinimumScale;
uniform float uHeightRangeScale;
uniform sampler2D uHeightTexture;
uniform float uLongitudeOffset;
uniform float uMicroDetail;
uniform sampler2D uNormalTexture;
uniform float uNormalStrength;
uniform float uPhotometricStrength;
uniform vec2 uPointer;
uniform float uReliefShadowStrength;
uniform vec2 uResolution;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uYaw;
uniform float uViewTilt;

out vec4 fragColor;

const float MERCURY_RADIUS = ${MERCURY_RADIUS.toFixed(2)};
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float SHADOW_ANGLES[12] = float[](
  0.0013962634,
  0.0027925268,
  0.0043633231,
  0.0066322512,
  0.0095993109,
  0.0139626340,
  0.0200712864,
  0.0287979327,
  0.0410152374,
  0.0584685243,
  0.0837758041,
  0.1221730476
);

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

float poseAngle() {
  return -uViewTilt + uPointer.y * 0.08;
}

float longitudeAngle() {
  return uLongitudeOffset + uYaw + uPointer.x * 0.13;
}

vec3 textureDirection(vec3 direction) {
  return rotateY(rotateX(direction, poseAngle()), longitudeAngle());
}

vec3 inverseTextureDirection(vec3 direction) {
  return rotateX(rotateY(direction, -longitudeAngle()), -poseAngle());
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

ivec2 wrappedTexel(ivec2 coordinate, ivec2 size) {
  int wrappedX = coordinate.x % size.x;
  if (wrappedX < 0) wrappedX += size.x;
  return ivec2(wrappedX, clamp(coordinate.y, 0, size.y - 1));
}

float decodeHeight(ivec2 coordinate) {
  ivec2 size = textureSize(uHeightTexture, 0);
  vec4 packed = texelFetch(uHeightTexture, wrappedTexel(coordinate, size), 0);
  float highByte = floor(packed.b * 255.0 + 0.5);
  float lowByte = floor(packed.a * 255.0 + 0.5);
  return (highByte * 256.0 + lowByte) / 65535.0;
}

float sampleHeight(vec3 direction) {
  ivec2 size = textureSize(uHeightTexture, 0);
  ivec2 coordinate = ivec2(floor(sphereUv(direction) * vec2(size)));
  return decodeHeight(coordinate);
}

vec3 decodeOctahedralNormal(vec2 encoded) {
  vec2 value = encoded * 2.0 - 1.0;
  vec3 normal = vec3(value, 1.0 - abs(value.x) - abs(value.y));
  if (normal.z < 0.0) {
    normal.xy = (1.0 - abs(normal.yx)) * sign(normal.xy);
  }
  return normalize(normal);
}

mat3 tangentFrame(vec3 radialDirection) {
  float horizontalLength = length(radialDirection.xz);
  vec3 east = vec3(1.0, 0.0, 0.0);
  if (horizontalLength > 0.0001) {
    east = vec3(radialDirection.z, 0.0, -radialDirection.x) / horizontalLength;
  }
  vec3 north = normalize(cross(radialDirection, east));
  return mat3(east, north, radialDirection);
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

float mercurialDiskLaw(float incidentCosine, float viewCosine, float phaseAngle) {
  const float diskWeight = 0.6424;
  const float phaseSlope = 0.5628;
  const float referenceIncident = 0.8660254038;
  float disk = diskWeight *
    (2.0 * incidentCosine) / max(incidentCosine + viewCosine, 0.0001) +
    (1.0 - diskWeight) * incidentCosine;
  float referenceDisk = diskWeight *
    (2.0 * referenceIncident) / (referenceIncident + 1.0) +
    (1.0 - diskWeight) * referenceIncident;
  float empirical = exp(-phaseSlope * (phaseAngle - PI / 6.0)) * disk / referenceDisk;
  float lambert = incidentCosine / referenceIncident;
  return mix(lambert, empirical, clamp(uPhotometricStrength, 0.0, 1.0));
}

float terrainVisibility(
  vec3 geometricNormal,
  vec3 mappedDirection,
  vec3 lightDirection
) {
  float incidentCosine = dot(geometricNormal, lightDirection);
  vec3 tangentLight = lightDirection - geometricNormal * incidentCosine;
  float tangentLength = length(tangentLight);
  if (
    incidentCosine <= 0.0 ||
    tangentLength < 0.0001 ||
    uReliefShadowStrength <= 0.0
  ) {
    return 1.0;
  }

  vec3 marchDirection = tangentLight / tangentLength;
  float raySlope = incidentCosine / tangentLength;
  float centerHeight = sampleHeight(mappedDirection);
  float centerRadius = 1.0 + uHeightMinimumScale + centerHeight * uHeightRangeScale;
  float maximumTerrainSlope = -1000.0;

  for (int index = 0; index < 12; index++) {
    float angularDistance = SHADOW_ANGLES[index];
    vec3 sampleRadial = normalize(
      geometricNormal * cos(angularDistance) + marchDirection * sin(angularDistance)
    );
    float sampleHeightValue = sampleHeight(textureDirection(sampleRadial));
    float sampleRadius = 1.0 + uHeightMinimumScale + sampleHeightValue * uHeightRangeScale;
    float terrainSlope = (
      sampleRadius * cos(angularDistance) - centerRadius
    ) / max(sampleRadius * sin(angularDistance), 0.00001);
    maximumTerrainSlope = max(maximumTerrainSlope, terrainSlope);
  }

  float softness = 0.004 + 0.55 * fwidth(raySlope);
  float visibility = smoothstep(
    maximumTerrainSlope - 0.006,
    maximumTerrainSlope + softness,
    raySlope
  );
  float directionFootprint = max(
    length(dFdx(mappedDirection)),
    length(dFdy(mappedDirection))
  ) * float(textureSize(uHeightTexture, 0).x) / TAU;
  float poleStretch = 1.0 / max(length(mappedDirection.xz), 0.12);
  float footprintFade = 1.0 - smoothstep(3.0, 10.0, directionFootprint * poleStretch);
  return mix(1.0, visibility, clamp(uReliefShadowStrength, 0.0, 1.0) * footprintFade);
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
  float radialDistance = length(position);
  float edgeWidth = max(fwidth(radialDistance), 0.0005);
  float coverage = 1.0 - smoothstep(
    MERCURY_RADIUS - edgeWidth,
    MERCURY_RADIUS + edgeWidth,
    radialDistance
  );
  if (coverage <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 spherePosition = position / MERCURY_RADIUS;
  vec3 geometricNormal = normalize(vec3(
    spherePosition,
    sqrt(max(1.0 - dot(spherePosition, spherePosition), 0.0))
  ));
  vec3 mappedDirection = textureDirection(geometricNormal);
  vec4 normalHeight = sampleEquirectangular(uNormalTexture, mappedDirection);
  vec3 tangentNormal = decodeOctahedralNormal(normalHeight.rg);
  tangentNormal = normalize(vec3(
    tangentNormal.xy * max(uNormalStrength, 0.0),
    max(tangentNormal.z, 0.001)
  ));
  vec3 mappedShadingNormal = tangentFrame(mappedDirection) * tangentNormal;
  vec3 shadingNormal = normalize(inverseTextureDirection(mappedShadingNormal));
  vec3 albedo = sampleEquirectangular(uAlbedoTexture, mappedDirection).rgb;
  if (uMicroDetail > 0.0) {
    float grain = valueNoise(mappedDirection * 176.0);
    grain = grain * 0.68 + valueNoise(mappedDirection * 397.0 + 17.0) * 0.32;
    albedo *= 1.0 + (grain - 0.5) * 0.14 * uMicroDetail;
  }

  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float geometricIncident = dot(geometricNormal, uSunDirection);
  float terminatorWidth = max(fwidth(geometricIncident), 0.0008);
  float geometricSunlight = smoothstep(-terminatorWidth, terminatorWidth, geometricIncident);
  float incidentCosine = max(dot(shadingNormal, uSunDirection), 0.0);
  float viewCosine = max(dot(shadingNormal, viewDirection), 0.0);
  float phaseAngle = acos(clamp(dot(uSunDirection, viewDirection), -1.0, 1.0));
  float photometry = mercurialDiskLaw(incidentCosine, viewCosine, phaseAngle);
  float reliefVisibility = terrainVisibility(geometricNormal, mappedDirection, uSunDirection);
  float directLight = geometricSunlight * photometry * reliefVisibility;

  vec3 linearColor = albedo * directLight * max(uExposure, 0.0);
  linearColor = filmic(linearColor);
  linearColor = pow(linearColor, vec3(1.0 / 2.2));
  float maximumColor = max(linearColor.r, max(linearColor.g, linearColor.b));
  float ditherStrength = smoothstep(0.0, 2.0 / 255.0, maximumColor);
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0 * ditherStrength;
  linearColor = clamp(linearColor + dither, 0.0, 1.0);
  fragColor = vec4(linearColor * coverage, coverage);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Mercurial shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Mercurial shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create Mercurial shader program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown Mercurial shader link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function createTexture(
  gl: WebGL2RenderingContext,
  pixel: readonly [number, number, number, number],
  minFilter: number,
  magFilter: number,
): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Unable to create Mercurial texture')
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
    new Uint8Array(pixel),
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  if (minFilter === gl.LINEAR_MIPMAP_LINEAR) gl.generateMipmap(gl.TEXTURE_2D)
  return texture
}

function createResources(gl: WebGL2RenderingContext): MercurialResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Mercurial vertex array')
  const resources = {
    albedoTexture: createTexture(gl, [255, 255, 255, 255], gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR),
    normalTexture: createTexture(gl, [128, 128, 128, 128], gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR),
    program: createProgram(gl),
    vertexArray,
  }
  gl.bindVertexArray(vertexArray)
  return resources
}

function deleteResources(gl: WebGL2RenderingContext, resources: MercurialResources): void {
  gl.deleteTexture(resources.albedoTexture)
  gl.deleteTexture(resources.normalTexture)
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

function textureSourceDimensions(source: TexImageSource): readonly [number, number] {
  if (source instanceof HTMLImageElement) return [source.naturalWidth, source.naturalHeight]
  if (source instanceof HTMLVideoElement) return [source.videoWidth, source.videoHeight]
  if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
    return [source.displayWidth, source.displayHeight]
  }
  const sized = source as { height?: number; width?: number }
  return [sized.width ?? 0, sized.height ?? 0]
}

function isSupportedPackedSource(source: TexImageSource): boolean {
  return (
    source instanceof HTMLImageElement ||
    source instanceof ImageData ||
    source instanceof ImageBitmap
  )
}

function validateSurface(surface: NonNullable<ReturnType<MercurialOrbSource['render']>>): void {
  if (!isSupportedPackedSource(surface.normalHeight)) {
    throw new Error('Mercurial normalHeight must be a static byte-preserving image source')
  }
  const albedoSize = textureSourceDimensions(surface.albedo)
  const normalHeightSize = textureSourceDimensions(surface.normalHeight)
  if (
    albedoSize[0] <= 0 ||
    albedoSize[1] <= 0 ||
    albedoSize[0] !== normalHeightSize[0] ||
    albedoSize[1] !== normalHeightSize[1] ||
    albedoSize[0] !== albedoSize[1] * 2
  ) {
    throw new Error('Mercurial albedo and normalHeight must be matching 2:1 images')
  }
  const [minimum, maximum] = surface.heightRangeMeters
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    throw new Error('Mercurial heightRangeMeters must be finite and strictly increasing')
  }
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: TexImageSource,
  internalFormat: number,
  generateMipmaps: boolean,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, image)
  if (generateMipmaps) gl.generateMipmap(gl.TEXTURE_2D)
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic') as AnisotropyExtension | null
  if (generateMipmaps && anisotropy) {
    const maximum = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
    gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(maximum, 8))
  }
}

function createMercurialRenderer(
  canvas: HTMLCanvasElement,
  source: MercurialOrbSource,
): CanvasRenderer<MercurialFrameSettings> | null {
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
  let heightMinimumScale = -10_764 / MERCURY_DATUM_RADIUS_METERS
  let heightRangeScale = (8_994 - -10_764) / MERCURY_DATUM_RADIUS_METERS
  let longitudeOffset = 0
  let resourceGeneration = 0
  let resources = createResources(gl)
  let startTime = performance.now()
  let lastTime = startTime
  const pointer = { currentX: 0, currentY: 0, targetX: 0, targetY: 0, velocityX: 0, velocityY: 0 }

  function uploadSource(): void {
    if (disposed || contextLost) return
    const surface = source.render()
    if (!surface) {
      hasSource = false
      return
    }
    validateSurface(surface)

    const previousColorSpace = gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) as number
    const previousFlip = Boolean(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL))
    const previousPremultiply = Boolean(gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL))
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    try {
      uploadTexture(gl, resources.albedoTexture, surface.albedo, gl.SRGB8_ALPHA8, true)
      uploadTexture(gl, resources.normalTexture, surface.normalHeight, gl.RGBA8, true)
    } finally {
      gl.bindTexture(gl.TEXTURE_2D, null)
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, previousColorSpace)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
    }
    hasSource = true
    heightMinimumScale = surface.heightRangeMeters[0] / MERCURY_DATUM_RADIUS_METERS
    heightRangeScale =
      (surface.heightRangeMeters[1] - surface.heightRangeMeters[0]) / MERCURY_DATUM_RADIUS_METERS
    longitudeOffset = ((surface.longitudeOffsetDegrees ?? 0) * Math.PI) / 180
  }

  function refreshSource(): void {
    const generation = resourceGeneration
    const ready = source.ready?.()
    if (!ready) {
      uploadSource()
      return
    }
    void ready.then(
      () => {
        if (generation === resourceGeneration) uploadSource()
      },
      () => {
        if (generation === resourceGeneration) uploadSource()
      },
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

  function render(timestamp: number, settings: MercurialFrameSettings): void {
    if (disposed || contextLost) return
    resize()
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
    gl.bindTexture(gl.TEXTURE_2D, resources.albedoTexture)
    gl.uniform1i(gl.getUniformLocation(resources.program, 'uAlbedoTexture'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, resources.normalTexture)
    gl.uniform1i(gl.getUniformLocation(resources.program, 'uNormalTexture'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, resources.normalTexture)
    gl.uniform1i(gl.getUniformLocation(resources.program, 'uHeightTexture'), 2)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uExposure'), settings.exposure)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uHeightMinimumScale'),
      heightMinimumScale,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uHeightRangeScale'), heightRangeScale)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uLongitudeOffset'), longitudeOffset)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uMicroDetail'), settings.microDetail)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uNormalStrength'),
      settings.normalStrength,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uPhotometricStrength'),
      settings.photometricStrength,
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uPointer'),
      pointer.currentX,
      pointer.currentY,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uReliefShadowStrength'),
      settings.reliefShadowStrength,
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uResolution'),
      canvas.width,
      canvas.height,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uSourceReady'), hasSource ? 1 : 0)
    gl.uniform3f(gl.getUniformLocation(resources.program, 'uSunDirection'), ...sunDirection)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uYaw'),
      ((settings.yaw + elapsed * settings.spin) * Math.PI) / 180,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uViewTilt'),
      (settings.tilt * Math.PI) / 180,
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
    if (disposed) return
    contextLost = false
    resourceGeneration += 1
    resources = createResources(gl)
    hasSource = false
    heightMinimumScale = -10_764 / MERCURY_DATUM_RADIUS_METERS
    heightRangeScale = (8_994 - -10_764) / MERCURY_DATUM_RADIUS_METERS
    longitudeOffset = 0
    refreshSource()
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
  refreshSource()
  resize()

  return {
    render,
    dispose(): void {
      disposed = true
      resourceGeneration += 1
      resizeObserver.disconnect()
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost) deleteResources(gl, resources)
    },
  }
}

export function MercurialOrbEffect({
  className,
  exposure = 0.92,
  lean = true,
  microDetail = 0.08,
  normalStrength = 1.35,
  photometricStrength = 1,
  reliefShadowStrength = 0.72,
  source,
  spin = 0.6,
  style,
  sunAzimuth = -12,
  sunElevation = 14,
  tilt = 0,
  yaw = 0,
}: MercurialOrbEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameSettings: MercurialFrameSettings = {
    exposure,
    lean,
    microDetail,
    normalStrength,
    photometricStrength,
    reliefShadowStrength,
    spin,
    sunAzimuth,
    sunElevation,
    tilt,
    yaw,
  }

  useCanvasRenderer(canvasRef, frameSettings, source, createMercurialRenderer)

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', touchAction: 'none', width: '100%', ...style }}
    />
  )
}
