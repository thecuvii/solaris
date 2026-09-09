// Hosted textures:
// https://solaris.cuvii.dev/textures/v1/mercury/mercury-albedo-1024.webp
// https://solaris.cuvii.dev/textures/v1/mercury/mercury-normal-height-1024.png
// Original textures:
// https://planetarymaps.usgs.gov/mosaic/Mercury_MESSENGER_ClrMosaic_global_665m_v3.tif
// https://planetarymaps.usgs.gov/mosaic/Mercury_Messenger_USGS_DEM_Global_665m_v2.tif

'use client'

import { OrbCanvas } from '../internal/orb-canvas'
import type { OrbRendererSpec, OrbSource } from '../internal/orb-renderer'
import { getUniformLocations, type UniformLocations } from '../internal/uniforms'
import {
  COMPOSITION_GLSL,
  COMPOSITION_UNIFORM_NAMES,
  createProgram,
  createTexture,
  createVertexArray,
  degreesToRadians,
  sunDirection,
  uploadImage,
  withUnpackState,
} from '../internal/webgl'
import type { OrbCanvasProps, OrbLightingProps, OrbPoseProps } from '../orb'

export type MercurialSurface = {
  albedo: TexImageSource
  heightRangeMeters: readonly [minimum: number, maximum: number]
  /** Technical source-meridian alignment only. Omitted means zero. */
  longitudeOffsetDegrees?: number
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
}

export type MercurialOrbSource = OrbSource<MercurialSurface>

export type MercurialOrbEffectProps = OrbCanvasProps &
  OrbPoseProps &
  OrbLightingProps & {
    /** Linear scene gain before tone mapping. @default 0.92 */
    exposure?: number
    /** Procedural regolith grain on the albedo. Range 0–1. @default 0.08 */
    microDetail?: number
    /** Tangent-space normal map strength. Range 0–3. @default 1.35 */
    normalStrength?: number
    /** Blend from Lambert (0) towards the empirical Mercury disk law (1). @default 1 */
    photometricStrength?: number
    /** Terrain self-shadowing from the height map. Range 0–1. @default 0.72 */
    reliefShadowStrength?: number
    source: MercurialOrbSource
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAlbedoTexture',
  'uExposure',
  'uHeightMinimumScale',
  'uHeightRangeScale',
  'uHeightTexture',
  'uLongitudeOffset',
  'uMicroDetail',
  'uNormalStrength',
  'uNormalTexture',
  'uPhotometricStrength',
  'uPointer',
  'uReliefShadowStrength',
  'uSourceReady',
  'uSunDirection',
  'uViewTilt',
  'uYaw',
] as const

type MercurialResources = {
  albedoTexture: WebGLTexture
  /** Datum-relative minimum radius offset, derived from the uploaded surface. */
  heightMinimumScale: number
  /** Datum-relative height span, derived from the uploaded surface. */
  heightRangeScale: number
  longitudeOffset: number
  normalTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
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

const MERCURY_DATUM_RADIUS_METERS = 2_439_400
/** MLA elevation range used until a surface reports its own. */
const DEFAULT_HEIGHT_RANGE_METERS = [-10_764, 8_994] as const
const MERCURY_RADIUS = 0.82

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

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
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uYaw;
uniform float uViewTilt;

${COMPOSITION_GLSL}
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
  // Decode before filtering: packed bytes cannot be interpolated as colors.
  vec2 pixel = sphereUv(direction) * vec2(textureSize(uHeightTexture, 0)) - 0.5;
  ivec2 base = ivec2(floor(pixel));
  vec2 blend = fract(pixel);
  return mix(
    mix(decodeHeight(base), decodeHeight(base + ivec2(1, 0)), blend.x),
    mix(decodeHeight(base + ivec2(0, 1)), decodeHeight(base + ivec2(1, 1)), blend.x),
    blend.y
  );
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

  vec2 position = compositionPosition();
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

function validateSurface(surface: MercurialSurface): void {
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

function heightMinimumScaleFor(range: readonly [number, number]): number {
  return range[0] / MERCURY_DATUM_RADIUS_METERS
}

function heightRangeScaleFor(range: readonly [number, number]): number {
  return (range[1] - range[0]) / MERCURY_DATUM_RADIUS_METERS
}

const spec: OrbRendererSpec<MercurialResources, MercurialFrameSettings, MercurialSurface> = {
  label: 'Mercury',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Mercury')
    return {
      albedoTexture: createTexture(gl, 'Mercury albedo', { placeholder: [255, 255, 255, 255] }),
      heightMinimumScale: heightMinimumScaleFor(DEFAULT_HEIGHT_RANGE_METERS),
      heightRangeScale: heightRangeScaleFor(DEFAULT_HEIGHT_RANGE_METERS),
      longitudeOffset: 0,
      normalTexture: createTexture(gl, 'Mercury normal', { placeholder: [128, 128, 128, 128] }),
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Mercury'),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteTexture(resources.albedoTexture)
    gl.deleteTexture(resources.normalTexture)
    gl.deleteProgram(resources.program)
    gl.deleteVertexArray(resources.vertexArray)
  },
  upload(gl, resources, surface) {
    validateSurface(surface)
    // Packed normal/height bytes must reach the GPU unmodified.
    withUnpackState(
      gl,
      { colorSpaceConversion: false, flipY: true, premultiplyAlpha: false },
      () => {
        uploadImage(gl, resources.albedoTexture, surface.albedo, {
          internalFormat: gl.SRGB8_ALPHA8,
        })
        uploadImage(gl, resources.normalTexture, surface.normalHeight)
      },
    )
    resources.heightMinimumScale = heightMinimumScaleFor(surface.heightRangeMeters)
    resources.heightRangeScale = heightRangeScaleFor(surface.heightRangeMeters)
    resources.longitudeOffset = degreesToRadians(surface.longitudeOffsetDegrees ?? 0)
  },
  isAnimated(settings) {
    return settings.spin !== 0
  },
  render(gl, resources, frame) {
    const { composition, elapsed, hasSource, pointerX, pointerY, settings } = frame
    const { uniforms } = resources

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.albedoTexture)
    gl.uniform1i(uniforms.uAlbedoTexture, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, resources.normalTexture)
    gl.uniform1i(uniforms.uNormalTexture, 1)
    // The height channels live in the normal texture; bind it again for texelFetch.
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, resources.normalTexture)
    gl.uniform1i(uniforms.uHeightTexture, 2)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uExposure, settings.exposure)
    gl.uniform1f(uniforms.uHeightMinimumScale, resources.heightMinimumScale)
    gl.uniform1f(uniforms.uHeightRangeScale, resources.heightRangeScale)
    gl.uniform1f(uniforms.uLongitudeOffset, resources.longitudeOffset)
    gl.uniform1f(uniforms.uMicroDetail, settings.microDetail)
    gl.uniform1f(uniforms.uNormalStrength, settings.normalStrength)
    gl.uniform1f(uniforms.uPhotometricStrength, settings.photometricStrength)
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(uniforms.uReliefShadowStrength, settings.reliefShadowStrength)
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform3f(
      uniforms.uSunDirection,
      ...sunDirection(settings.sunAzimuth, settings.sunElevation),
    )
    gl.uniform1f(uniforms.uYaw, degreesToRadians(settings.yaw + elapsed * settings.spin))
    gl.uniform1f(uniforms.uViewTilt, degreesToRadians(settings.tilt))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function MercurialOrbEffect({
  className,
  composition,
  exposure = 0.92,
  lean = true,
  microDetail = 0.08,
  normalStrength = 1.35,
  onError,
  paused,
  photometricStrength = 1,
  reliefShadowStrength = 0.72,
  source,
  spin = 0.6,
  style,
  sunAzimuth = -12,
  sunElevation = 14,
  tilt = 0,
  viewport,
  yaw = 0,
}: MercurialOrbEffectProps) {
  const settings: MercurialFrameSettings = {
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
