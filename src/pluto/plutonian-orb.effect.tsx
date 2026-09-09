// Hosted textures:
// https://solaris.cuvii.dev/textures/v1/pluto/pluto-albedo-1024.png
// https://solaris.cuvii.dev/textures/v1/pluto/pluto-normal-height-1024.png
// Original textures:
// https://d2pn8kiwq2w21t.cloudfront.net/original_images/jpegPIA11707.jpg
// https://planetarymaps.usgs.gov/mosaic/Pluto_NewHorizons_Global_DEM_300m_Jul2017_16bit.tif

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
  sunDirection,
  uploadImage,
  withUnpackState,
} from '../internal/webgl'
import type { OrbCanvasProps, OrbLightingProps, OrbPoseProps } from '../orb'

export type PlutonianSurface = {
  /** sRGB RGB; alpha byte round(reliefConfidence * 254) + 1. */
  albedo: HTMLImageElement
  heightRangeMeters: readonly [minimum: number, maximum: number]
  /** Linear RGBA8: octahedral tangent normal RG and normalized height BA. */
  normalHeight: HTMLImageElement
}

export type PlutonianOrbSource = OrbSource<PlutonianSurface>

export type PlutonianOrbEffectProps = OrbCanvasProps &
  OrbPoseProps &
  OrbLightingProps & {
    /** Linear scene gain before tone mapping. Range 0–2. @default 1 */
    exposure?: number
    /** Blue haze density; 0 disables the haze shell. Range 0–1.5. @default 0.28 */
    hazeDensity?: number
    /** Henyey–Greenstein asymmetry of the haze phase function. Range 0–0.92. @default 0.78 */
    hazeForwardScattering?: number
    /** Haze shell thickness as a fraction of the body radius. Range 0–0.18. @default 0.08 */
    hazeThickness?: number
    /** Specular response of bright volatile ices. Range 0–2. @default 0.6 */
    iceResponse?: number
    /** Ambient fill lifting the night side. Range 0–0.25. @default 0.035 */
    phaseFill?: number
    /** Normal-map and terrain self-shadowing strength where relief data is confident. Range 0–2. @default 0.85 */
    reliefShadowStrength?: number
    /** Microfacet roughness of the ice specular lobe. Range 0.35–1. @default 0.78 */
    roughness?: number
    source: PlutonianOrbSource
    /** Reddening of dark tholin-rich terrain. Range 0–1.5. @default 1 */
    tholinStrength?: number
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAlbedoTexture',
  'uExposure',
  'uHazeDensity',
  'uHazeForwardScattering',
  'uHazeThickness',
  'uHeightMinimumScale',
  'uHeightRangeScale',
  'uHeightTexture',
  'uIceResponse',
  'uNormalTexture',
  'uPhaseFill',
  'uPointer',
  'uReliefShadowStrength',
  'uRoughness',
  'uSourceReady',
  'uSunDirection',
  'uTholinStrength',
  'uViewTilt',
  'uYaw',
] as const

type PlutonianResources = {
  albedoTexture: WebGLTexture
  /** Datum-relative minimum radius offset, derived from the uploaded surface. */
  heightMinimumScale: number
  /** Datum-relative height span, derived from the uploaded surface. */
  heightRangeScale: number
  heightTexture: WebGLTexture
  normalTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

type PlutonianFrameSettings = {
  exposure: number
  hazeDensity: number
  hazeForwardScattering: number
  hazeThickness: number
  iceResponse: number
  lean: boolean
  phaseFill: number
  reliefShadowStrength: number
  roughness: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  tholinStrength: number
  tilt: number
  yaw: number
}

const PLUTO_DATUM_RADIUS_METERS = 1_188_300
/** New Horizons elevation range used until a surface reports its own. */
const DEFAULT_HEIGHT_RANGE_METERS = [-4_101, 6_491] as const
const PLUTO_RADIUS = 0.82

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uAlbedoTexture;
uniform float uExposure;
uniform float uHazeForwardScattering;
uniform float uHazeDensity;
uniform float uHazeThickness;
uniform float uHeightMinimumScale;
uniform float uHeightRangeScale;
uniform sampler2D uHeightTexture;
uniform float uIceResponse;
uniform sampler2D uNormalTexture;
uniform float uPhaseFill;
uniform vec2 uPointer;
uniform float uReliefShadowStrength;
uniform float uRoughness;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uYaw;
uniform float uTholinStrength;
uniform float uViewTilt;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float BODY_RADIUS = ${PLUTO_RADIUS.toFixed(2)};
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float HORIZON_ANGLES[8] = float[](
  0.0013962634,
  0.0031415927,
  0.0069813170,
  0.0148352986,
  0.0314159265,
  0.0593411946,
  0.0977384381,
  0.1396263402
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
  return uYaw + uPointer.x * 0.13;
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

ivec2 directionTexel(vec3 direction, ivec2 size) {
  return wrappedTexel(ivec2(floor(sphereUv(direction) * vec2(size))), size);
}

float decodeReliefConfidence(float transportAlpha) {
  return clamp((transportAlpha * 255.0 - 1.0) / 254.0, 0.0, 1.0);
}

float sampleReliefConfidence(vec3 direction) {
  ivec2 size = textureSize(uAlbedoTexture, 0);
  return decodeReliefConfidence(texelFetch(uAlbedoTexture, directionTexel(direction, size), 0).a);
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
  return decodeHeight(directionTexel(direction, size));
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

float terrainVisibility(vec3 geometricNormal, vec3 mappedDirection, vec3 lightDirection) {
  if (uReliefShadowStrength <= 0.0) return 1.0;
  float centerConfidence = sampleReliefConfidence(mappedDirection);
  if (centerConfidence <= 0.0) return 1.0;

  float incidentCosine = dot(geometricNormal, lightDirection);
  vec3 tangentLight = lightDirection - geometricNormal * incidentCosine;
  float tangentLength = length(tangentLight);
  if (incidentCosine <= 0.0 || tangentLength < 0.0001) return 1.0;

  vec3 marchDirection = tangentLight / tangentLength;
  float raySlope = incidentCosine / tangentLength;
  float centerHeight = sampleHeight(mappedDirection);
  float centerRadius = 1.0 + (
    uHeightMinimumScale + centerHeight * uHeightRangeScale
  ) * uReliefShadowStrength;
  float maximumTerrainSlope = -1000.0;

  for (int index = 0; index < 8; index++) {
    float angularDistance = HORIZON_ANGLES[index];
    vec3 sampleRadial = normalize(
      geometricNormal * cos(angularDistance) + marchDirection * sin(angularDistance)
    );
    vec3 mappedSample = textureDirection(sampleRadial);
    float sampleConfidence = sampleReliefConfidence(mappedSample);
    if (sampleConfidence <= 0.0) continue;
    float sampleHeightValue = sampleHeight(mappedSample);
    float sampleRadius = 1.0 + (
      uHeightMinimumScale + sampleHeightValue * uHeightRangeScale
    ) * uReliefShadowStrength;
    float terrainSlope = (
      sampleRadius * cos(angularDistance) - centerRadius
    ) / max(sampleRadius * sin(angularDistance), 0.00001);
    float confidenceSlope = mix(raySlope - 0.08, terrainSlope, sampleConfidence);
    maximumTerrainSlope = max(maximumTerrainSlope, confidenceSlope);
  }

  float softness = 0.004 + 0.45 * fwidth(raySlope);
  float visibility = smoothstep(
    maximumTerrainSlope - 0.005,
    maximumTerrainSlope + softness,
    raySlope
  );
  float directionFootprint = max(
    length(dFdx(mappedDirection)),
    length(dFdy(mappedDirection))
  ) * float(textureSize(uHeightTexture, 0).x) / TAU;
  float poleStretch = 1.0 / max(length(mappedDirection.xz), 0.12);
  float footprintFade = 1.0 - smoothstep(3.0, 9.0, directionFootprint * poleStretch);
  float shadowWeight = centerConfidence * footprintFade * clamp(uReliefShadowStrength, 0.0, 1.0);
  return mix(1.0, visibility, shadowWeight);
}

float henyeyGreenstein(float cosineTheta, float asymmetry) {
  float g = clamp(asymmetry, 0.0, 0.92);
  float denominator = max(1.0 + g * g - 2.0 * g * cosineTheta, 0.00001);
  return (1.0 - g * g) / (4.0 * PI * pow(denominator, 1.5));
}

float bodySunVisibility(vec3 samplePosition, vec3 lightDirection) {
  float projection = dot(samplePosition, lightDirection);
  float discriminant = projection * projection - (
    dot(samplePosition, samplePosition) - BODY_RADIUS * BODY_RADIUS
  );
  if (projection >= 0.0 || discriminant <= 0.0) return 1.0;
  float nearest = -projection - sqrt(discriminant);
  return smoothstep(-0.0015, 0.0015, -nearest);
}

void integrateHaze(
  vec2 position,
  bool surfaceHit,
  float surfaceZ,
  float shellRadius,
  out vec3 inScattering,
  out float viewTransmission
) {
  inScattering = vec3(0.0);
  viewTransmission = 1.0;
  if (uHazeDensity <= 0.0 || uHazeThickness <= 0.0) return;

  float shellZ = sqrt(max(shellRadius * shellRadius - dot(position, position), 0.0));
  float endZ = surfaceHit ? surfaceZ : -shellZ;
  float pathLength = max(shellZ - endZ, 0.0);
  float stepLength = pathLength / 6.0;
  float scaleHeight = 0.042 * BODY_RADIUS;
  float support = uHazeThickness * BODY_RADIUS;
  float normalization = scaleHeight * max(1.0 - exp(-support / scaleHeight), 0.00001);
  float tauVertical = 0.08 * uHazeDensity;
  float phaseMeanOne = 4.0 * PI * henyeyGreenstein(
    dot(-uSunDirection, vec3(0.0, 0.0, 1.0)),
    uHazeForwardScattering
  );

  for (int index = 0; index < 6; index++) {
    float sampleZ = shellZ - (float(index) + 0.5) * stepLength;
    vec3 samplePosition = vec3(position, sampleZ);
    float altitude = max(length(samplePosition) - BODY_RADIUS, 0.0);
    float density = exp(-altitude / scaleHeight) / normalization;
    float deltaTau = tauVertical * density * stepLength;
    float sunVisibility = bodySunVisibility(samplePosition, uSunDirection);
    float scatterWeight = viewTransmission * (1.0 - exp(-deltaTau)) * 0.92;
    inScattering += scatterWeight * vec3(0.24, 0.52, 1.0) * phaseMeanOne * sunVisibility;
    viewTransmission *= exp(-deltaTau);
  }
}

vec3 filmic(vec3 color) {
  color = max(color, 0.0);
  return clamp(
    (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14),
    0.0,
    1.0
  );
}

void main() {
  if (uSourceReady < 0.5) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 position = compositionPosition();
  float radialDistance = length(position);
  float hazeSupport = max(uHazeThickness, 0.0) * BODY_RADIUS;
  float shellRadius = BODY_RADIUS + hazeSupport;
  float edgeWidth = max(fwidth(radialDistance), 0.0005);
  float surfaceCoverage = 1.0 - smoothstep(
    BODY_RADIUS - edgeWidth,
    BODY_RADIUS + edgeWidth,
    radialDistance
  );
  float atmosphereCoverage = 0.0;
  if (uHazeDensity > 0.0 && uHazeThickness > 0.0) {
    atmosphereCoverage = 1.0 - smoothstep(
      shellRadius - edgeWidth,
      shellRadius + edgeWidth,
      radialDistance
    );
  }
  if (surfaceCoverage <= 0.0 && atmosphereCoverage <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  bool surfaceHit = radialDistance < BODY_RADIUS;
  float surfaceZ = surfaceHit
    ? sqrt(max(BODY_RADIUS * BODY_RADIUS - dot(position, position), 0.0))
    : 0.0;
  vec3 surfaceLinear = vec3(0.0);

  if (surfaceHit || surfaceCoverage > 0.0) {
    vec3 geometricNormal = normalize(vec3(position / BODY_RADIUS, surfaceZ / BODY_RADIUS));
    vec3 mappedDirection = textureDirection(geometricNormal);
    vec4 albedoSample = sampleEquirectangular(uAlbedoTexture, mappedDirection);
    float reliefConfidence = decodeReliefConfidence(albedoSample.a);
    vec3 albedo = albedoSample.rgb;
    float sourceLuminance = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
    float sourceChroma = max(albedo.r, max(albedo.g, albedo.b)) - min(albedo.r, min(albedo.g, albedo.b));
    float redness = max(albedo.r - max(albedo.g, albedo.b) * 1.04, 0.0);
    float tholinMask = smoothstep(0.015, 0.16, redness) * (1.0 - smoothstep(0.18, 0.46, sourceLuminance));
    float tholinAmount = clamp(uTholinStrength, 0.0, 1.5) * tholinMask;
    albedo *= mix(vec3(1.0), vec3(0.82, 0.66, 0.57), clamp(tholinAmount * 0.42, 0.0, 0.62));
    float iceMask = smoothstep(0.24, 0.52, sourceLuminance) * (
      1.0 - 0.45 * smoothstep(0.08, 0.28, sourceChroma)
    );

    vec3 tangentNormal = vec3(0.0, 0.0, 1.0);
    if (reliefConfidence > 0.0 && uReliefShadowStrength > 0.0) {
      tangentNormal = decodeOctahedralNormal(
        sampleEquirectangular(uNormalTexture, mappedDirection).rg
      );
      tangentNormal = normalize(vec3(
        tangentNormal.xy * uReliefShadowStrength * reliefConfidence,
        max(tangentNormal.z, 0.02)
      ));
    }
    vec3 mappedShadingNormal = tangentFrame(mappedDirection) * tangentNormal;
    vec3 shadingNormal = normalize(inverseTextureDirection(mappedShadingNormal));
    vec3 viewDirection = vec3(0.0, 0.0, 1.0);
    float geometricIncident = dot(geometricNormal, uSunDirection);
    float terminatorWidth = max(fwidth(geometricIncident), 0.0008);
    float geometricSunlight = smoothstep(-terminatorWidth, terminatorWidth, geometricIncident);
    float incidentCosine = max(dot(shadingNormal, uSunDirection), 0.0);
    float viewCosine = max(dot(shadingNormal, viewDirection), 0.0);
    float lsNormalized = 2.0 * incidentCosine / max(incidentCosine + viewCosine, 0.00001);
    float singleScatterMix = mix(0.88, 0.62, iceMask);
    float diffuseDisk = mix(incidentCosine, lsNormalized, singleScatterMix);

    float iceWeight = 0.0;
    float fresnel = 0.0;
    float specular = 0.0;
    if (uIceResponse > 0.0 && incidentCosine > 0.0 && viewCosine > 0.0) {
      vec3 halfVectorSum = uSunDirection + viewDirection;
      if (length(halfVectorSum) >= 0.00001) {
        vec3 halfVector = normalize(halfVectorSum);
        float normalHalf = clamp(dot(shadingNormal, halfVector), 0.0, 1.0);
        float viewHalf = clamp(dot(viewDirection, halfVector), 0.0, 1.0);
        float alpha = max(clamp(uRoughness, 0.35, 1.0) * clamp(uRoughness, 0.35, 1.0), 0.04);
        float alphaSquared = alpha * alpha;
        float distributionTerm = normalHalf * normalHalf * (alphaSquared - 1.0) + 1.0;
        float distribution = alphaSquared / max(PI * distributionTerm * distributionTerm, 0.00001);
        float visibilityDenominator = incidentCosine * sqrt(
          alphaSquared + (1.0 - alphaSquared) * viewCosine * viewCosine
        ) + viewCosine * sqrt(
          alphaSquared + (1.0 - alphaSquared) * incidentCosine * incidentCosine
        );
        float visibility = 0.5 / max(visibilityDenominator, 0.00001);
        fresnel = 0.018 + (1.0 - 0.018) * pow(1.0 - viewHalf, 5.0);
        iceWeight = clamp(0.5 * iceMask * uIceResponse, 0.0, 1.0);
        specular = distribution * visibility * fresnel * incidentCosine * iceWeight;
      }
    }

    float reliefVisibility = terrainVisibility(geometricNormal, mappedDirection, uSunDirection);
    vec3 diffuse = albedo * diffuseDisk * (1.0 - iceWeight * fresnel);
    vec3 direct = (diffuse + vec3(specular)) * geometricSunlight * reliefVisibility;
    vec3 phaseFill = albedo * max(uPhaseFill, 0.0) * (0.35 + 0.65 * viewCosine);
    surfaceLinear = direct + phaseFill;
  }

  vec3 inScattering = vec3(0.0);
  float viewTransmission = 1.0;
  if (atmosphereCoverage > 0.0) {
    integrateHaze(
      position,
      surfaceHit,
      surfaceZ,
      shellRadius,
      inScattering,
      viewTransmission
    );
  }

  float atmosphereAlpha = atmosphereCoverage * (1.0 - viewTransmission);
  float alpha = surfaceCoverage + (1.0 - surfaceCoverage) * atmosphereAlpha;
  if (alpha <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }
  vec3 premultipliedLinear = surfaceLinear * surfaceCoverage * viewTransmission
    + atmosphereCoverage * inScattering;
  vec3 straightLinear = premultipliedLinear / max(alpha, 0.00001);
  vec3 displayColor = pow(
    filmic(straightLinear * max(uExposure, 0.0)),
    vec3(1.0 / 2.2)
  );
  fragColor = vec4(displayColor * alpha, alpha);
}
`

function validateSurface(surface: PlutonianSurface): void {
  const { albedo, normalHeight } = surface
  if (
    !(albedo instanceof HTMLImageElement) ||
    !(normalHeight instanceof HTMLImageElement) ||
    !albedo.complete ||
    !normalHeight.complete ||
    albedo.naturalWidth <= 0 ||
    albedo.naturalHeight <= 0 ||
    albedo.naturalWidth !== normalHeight.naturalWidth ||
    albedo.naturalHeight !== normalHeight.naturalHeight ||
    albedo.naturalWidth !== albedo.naturalHeight * 2
  ) {
    throw new Error('Plutonian albedo and normalHeight must be decoded matching 2:1 images')
  }
  const [minimum, maximum] = surface.heightRangeMeters
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    throw new Error('Plutonian heightRangeMeters must be finite and strictly increasing')
  }
}

function wrapDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180
}

function heightMinimumScaleFor(range: readonly [number, number]): number {
  return range[0] / PLUTO_DATUM_RADIUS_METERS
}

function heightRangeScaleFor(range: readonly [number, number]): number {
  return (range[1] - range[0]) / PLUTO_DATUM_RADIUS_METERS
}

/** Placeholder normal/height texel: flat normal at datum height within the default range. */
function datumPlaceholder(): readonly [number, number, number, number] {
  const [minimum, maximum] = DEFAULT_HEIGHT_RANGE_METERS
  const datumNormalized = Math.round(((0 - minimum) / (maximum - minimum)) * 65_535)
  return [128, 128, datumNormalized >> 8, datumNormalized & 255]
}

const spec: OrbRendererSpec<PlutonianResources, PlutonianFrameSettings, PlutonianSurface> = {
  label: 'Pluto',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Pluto')
    const placeholder = datumPlaceholder()
    return {
      albedoTexture: createTexture(gl, 'Pluto albedo', { placeholder: [150, 128, 118, 1] }),
      heightMinimumScale: heightMinimumScaleFor(DEFAULT_HEIGHT_RANGE_METERS),
      heightRangeScale: heightRangeScaleFor(DEFAULT_HEIGHT_RANGE_METERS),
      heightTexture: createTexture(gl, 'Pluto height', {
        magFilter: gl.NEAREST,
        minFilter: gl.NEAREST,
        placeholder,
      }),
      normalTexture: createTexture(gl, 'Pluto normal', { placeholder }),
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Pluto'),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteTexture(resources.albedoTexture)
    gl.deleteTexture(resources.heightTexture)
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
        uploadImage(gl, resources.heightTexture, surface.normalHeight, { mipmaps: false })
      },
    )
    resources.heightMinimumScale = heightMinimumScaleFor(surface.heightRangeMeters)
    resources.heightRangeScale = heightRangeScaleFor(surface.heightRangeMeters)
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
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, resources.heightTexture)
    gl.uniform1i(uniforms.uHeightTexture, 2)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uExposure, clamp(settings.exposure, 0, 2))
    gl.uniform1f(uniforms.uHazeDensity, clamp(settings.hazeDensity, 0, 1.5))
    gl.uniform1f(uniforms.uHazeForwardScattering, clamp(settings.hazeForwardScattering, 0, 0.92))
    gl.uniform1f(uniforms.uHazeThickness, clamp(settings.hazeThickness, 0, 0.18))
    gl.uniform1f(uniforms.uHeightMinimumScale, resources.heightMinimumScale)
    gl.uniform1f(uniforms.uHeightRangeScale, resources.heightRangeScale)
    gl.uniform1f(uniforms.uIceResponse, clamp(settings.iceResponse, 0, 2))
    gl.uniform1f(uniforms.uPhaseFill, clamp(settings.phaseFill, 0, 0.25))
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(uniforms.uReliefShadowStrength, clamp(settings.reliefShadowStrength, 0, 2))
    gl.uniform1f(uniforms.uRoughness, clamp(settings.roughness, 0.35, 1))
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform3f(
      uniforms.uSunDirection,
      ...sunDirection(clamp(settings.sunAzimuth, -180, 180), clamp(settings.sunElevation, -30, 90)),
    )
    gl.uniform1f(uniforms.uTholinStrength, clamp(settings.tholinStrength, 0, 1.5))
    gl.uniform1f(uniforms.uViewTilt, degreesToRadians(clamp(settings.tilt, -30, 30)))
    gl.uniform1f(
      uniforms.uYaw,
      degreesToRadians(wrapDegrees(settings.yaw) + elapsed * settings.spin),
    )
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function PlutonianOrbEffect({
  className,
  composition,
  exposure = 1,
  hazeDensity = 0.28,
  hazeForwardScattering = 0.78,
  hazeThickness = 0.08,
  iceResponse = 0.6,
  lean = true,
  onError,
  paused,
  phaseFill = 0.035,
  reliefShadowStrength = 0.85,
  roughness = 0.78,
  source,
  spin = 0,
  style,
  sunAzimuth = -38,
  sunElevation = 16,
  tholinStrength = 1,
  tilt = 25,
  viewport,
  yaw = 0,
}: PlutonianOrbEffectProps) {
  const settings: PlutonianFrameSettings = {
    exposure,
    hazeDensity,
    hazeForwardScattering,
    hazeThickness,
    iceResponse,
    lean,
    phaseFill,
    reliefShadowStrength,
    roughness,
    spin,
    sunAzimuth,
    sunElevation,
    tholinStrength,
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
