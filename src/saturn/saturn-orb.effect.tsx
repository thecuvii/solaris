// Hosted textures:
// https://solaris.cuvii.dev/textures/v1/saturn/saturn-atmosphere.webp
// https://solaris.cuvii.dev/textures/v1/saturn/saturn-rings.png
// Original texture and ring data:
// https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/saturn/Saturn.tif
// https://pds-rings.seti.org/saturn/saturn_rings_table.html

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

export type SaturnSurface = {
  /** Equirectangular sRGB cloud albedo; alpha carries band detail for shading normals. */
  atmosphere: TexImageSource
  longitudeOffsetDegrees?: number
  /** Inner and outer ring edge as multiples of the equatorial radius. */
  ringRadiusRange: readonly [innerEquatorialRadii: number, outerEquatorialRadii: number]
  /** 1D radial ring strip: RGB colour, alpha encodes optical depth. */
  rings: TexImageSource
}

export type SaturnOrbSource = OrbSource<SaturnSurface>

export type SaturnOrbEffectProps = OrbCanvasProps &
  OrbPoseProps &
  OrbLightingProps & {
    /** Roll of the polar axis in the image plane in degrees. Positive leans the north pole right. @default -8 */
    axialRoll?: number
    /** Contrast of the zonal band structure. Range 0–1. @default 0.12 */
    bandContrast?: number
    /** Zonal cloud advection speed in degrees per second. @default 1 */
    bandDrift?: number
    /** Blend from Lambert (0) towards a limb-darkened cloud photometry (1). @default 0.42 */
    cloudPhotometricMix?: number
    /** Procedural cloud filament contrast; also sharpens shading normals. Range 0–0.3. @default 0.06 */
    detailIntensity?: number
    /** Linear scene gain before tone mapping. @default 0.96 */
    exposure?: number
    /** Polar flattening in percent of the equatorial radius. Range 0–20. @default 9.8 */
    flattening?: number
    /** Ring forward-scattering lobe when backlit. Range 0–1. @default 0.35 */
    forwardScattering?: number
    /** Warm haze along the sunlit limb and atmosphere optical depth. Range 0–1. @default 0.1 */
    limbHaze?: number
    /** Visibility of the north polar hexagon. Range 0–1. @default 0.14 */
    polarHexagon?: number
    /** Ring optical depth multiplier. Range 0–2. @default 1 */
    ringOpacity?: number
    /** Ring shadow cast on the planet. Range 0–1. @default 0.82 */
    ringShadowStrength?: number
    source: SaturnOrbSource
    /** Brightness of the unlit ring face and planet-shadowed ring. Range 0–0.3. @default 0.08 */
    unlitRingBrightness?: number
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAtmosphereTexture',
  'uAxialRoll',
  'uBandContrast',
  'uBandDrift',
  'uCloudPhotometricMix',
  'uCompositionSize',
  'uDetailIntensity',
  'uExposure',
  'uFlattening',
  'uForwardScattering',
  'uLimbHaze',
  'uLongitudeOffset',
  'uPointer',
  'uPolarHexagon',
  'uRingOpacity',
  'uRingRadiusRange',
  'uRingShadowStrength',
  'uRingTexture',
  'uRingTilt',
  'uSourceReady',
  'uSunDirectionView',
  'uTime',
  'uUnlitRingBrightness',
  'uYaw',
] as const

type SaturnResources = {
  atmosphereTexture: WebGLTexture
  longitudeOffset: number
  program: WebGLProgram
  /** Equatorial-radius multiples, derived from the uploaded surface. */
  ringRadiusRange: readonly [number, number]
  ringTexture: WebGLTexture
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

type SaturnFrameSettings = {
  axialRoll: number
  bandContrast: number
  bandDrift: number
  cloudPhotometricMix: number
  detailIntensity: number
  exposure: number
  flattening: number
  forwardScattering: number
  lean: boolean
  limbHaze: number
  polarHexagon: number
  ringOpacity: number
  ringShadowStrength: number
  spin: number
  tilt: number
  sunAzimuth: number
  sunElevation: number
  yaw: number
  unlitRingBrightness: number
}

const SATURN_RADIUS = 0.42
/** Main ring system (C ring inner edge to A ring outer edge) until a surface reports its own. */
const DEFAULT_RING_RADIUS_RANGE = [66900 / 60268, 140500 / 60268] as const

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uAtmosphereTexture;
uniform float uAxialRoll;
uniform float uBandContrast;
uniform float uCloudPhotometricMix;
uniform vec2 uCompositionSize;
uniform float uDetailIntensity;
uniform float uBandDrift;
uniform float uExposure;
uniform float uForwardScattering;
uniform float uLimbHaze;
uniform float uLongitudeOffset;
uniform float uFlattening;
uniform float uPolarHexagon;
uniform vec2 uPointer;
uniform float uRingOpacity;
uniform vec2 uRingRadiusRange;
uniform float uRingShadowStrength;
uniform sampler2D uRingTexture;
uniform float uRingTilt;
uniform float uSourceReady;
uniform vec3 uSunDirectionView;
uniform float uYaw;
uniform float uTime;
uniform float uUnlitRingBrightness;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float PI = 3.141592653589793;
const float SATURN_RADIUS = ${SATURN_RADIUS.toFixed(2)};
const float TAU = 6.283185307179586;
const int RING_INTEGRATION_SAMPLES = 6;
const int SUN_DISK_SAMPLES = 8;
const float SUN_DISK_RADIUS = 0.03;
const int ATMOSPHERE_SAMPLES = 6;
const float ATMOSPHERE_THICKNESS = 0.024;

struct RingTransport {
  vec3 radiance;
  float transmission;
};

struct AtmosphereTransport {
  vec3 radiance;
  float transmission;
  float nearDistance;
};

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

vec3 rotateZ(vec3 value, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec3(cosine * value.x - sine * value.y, sine * value.x + cosine * value.y, value.z);
}

vec3 viewToBody(vec3 value, float tilt, float roll) {
  return rotateX(rotateZ(value, -roll), -tilt);
}

vec2 sphereUv(vec3 direction) {
  return vec2(
    fract(atan(direction.x, direction.z) / TAU + 0.5),
    clamp(asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5, 0.0, 1.0)
  );
}

vec4 sampleEquirectangular(
  sampler2D image,
  vec3 direction,
  vec3 directionDerivativeX,
  vec3 directionDerivativeY
) {
  vec2 uv = sphereUv(direction);
  vec3 directionDx = normalize(direction + directionDerivativeX);
  vec3 directionDy = normalize(direction + directionDerivativeY);
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

vec2 rayEllipsoidWithCoverage(vec3 origin, vec3 direction, vec3 radii) {
  vec3 inverseRadiiSquared = 1.0 / (radii * radii);
  float a = dot(direction * direction, inverseRadiiSquared);
  float b = 2.0 * dot(origin * direction, inverseRadiiSquared);
  float c = dot(origin * origin, inverseRadiiSquared) - 1.0;
  float discriminant = b * b - 4.0 * a * c;
  float edgeWidth = max(fwidth(discriminant) * 1.15, 0.00001);
  float coverage = smoothstep(-edgeWidth, edgeWidth, discriminant);
  float closestDistance = max(-b / (2.0 * a), 0.0);
  if (discriminant < -edgeWidth) return vec2(closestDistance, 0.0);
  float root = sqrt(max(discriminant, 0.0));
  float nearHit = (-b - root) / (2.0 * a);
  float farHit = (-b + root) / (2.0 * a);
  float distance = nearHit > 0.0001 ? nearHit : farHit;
  return vec2(distance > 0.0001 ? distance : closestDistance, coverage);
}

vec3 rayEllipsoidInterval(vec3 origin, vec3 direction, vec3 radii) {
  vec3 inverseRadiiSquared = 1.0 / (radii * radii);
  float a = dot(direction * direction, inverseRadiiSquared);
  float b = 2.0 * dot(origin * direction, inverseRadiiSquared);
  float c = dot(origin * origin, inverseRadiiSquared) - 1.0;
  float discriminant = b * b - 4.0 * a * c;
  float edgeWidth = max(fwidth(discriminant) * 1.2, 0.00001);
  float coverage = smoothstep(-edgeWidth, edgeWidth, discriminant);
  if (discriminant < -edgeWidth) return vec3(-1.0, -1.0, 0.0);
  float root = sqrt(max(discriminant, 0.0));
  float nearDistance = (-b - root) / (2.0 * a);
  float farDistance = (-b + root) / (2.0 * a);
  return vec3(nearDistance, farDistance, coverage);
}

vec2 ringUv(float radiusRatio) {
  float radial = (radiusRatio - uRingRadiusRange.x) /
    max(uRingRadiusRange.y - uRingRadiusRange.x, 0.000001);
  return vec2(radial, 0.5);
}

vec4 sampleRingData(float radiusRatio, float lod) {
  return textureLod(uRingTexture, ringUv(radiusRatio), lod);
}

float ringOpticalDepth(vec4 ringData) {
  return ringData.a * ringData.a * 4.0 * max(uRingOpacity, 0.0);
}

float integrateRingTransmission(float radiusRatio, float halfFootprint, float opening) {
  float safeHalfFootprint = max(halfFootprint, 0.000001);
  float overlapStart = max(radiusRatio - safeHalfFootprint, uRingRadiusRange.x);
  float overlapEnd = min(radiusRatio + safeHalfFootprint, uRingRadiusRange.y);
  float overlap = max(overlapEnd - overlapStart, 0.0);
  float coverage = clamp(overlap / (2.0 * safeHalfFootprint), 0.0, 1.0);
  if (coverage <= 0.0) return 1.0;

  float accumulatedTransmission = 0.0;
  for (int index = 0; index < RING_INTEGRATION_SAMPLES; index += 1) {
    float position = (float(index) + 0.5) / float(RING_INTEGRATION_SAMPLES);
    float sampleRadius = mix(overlapStart, overlapEnd, position);
    float opticalDepth = ringOpticalDepth(sampleRingData(sampleRadius, 0.0));
    accumulatedTransmission += exp(-opticalDepth / max(opening, 0.045));
  }

  float meanTransmission = accumulatedTransmission / float(RING_INTEGRATION_SAMPLES);
  return mix(1.0, meanTransmission, coverage);
}

vec2 sunDiskPoint(int index) {
  if (index == 0) return vec2(-0.62, -0.28);
  if (index == 1) return vec2(-0.18, -0.74);
  if (index == 2) return vec2(0.48, -0.56);
  if (index == 3) return vec2(0.78, 0.08);
  if (index == 4) return vec2(0.36, 0.7);
  if (index == 5) return vec2(-0.32, 0.64);
  if (index == 6) return vec2(-0.76, 0.24);
  return vec2(0.08, 0.12);
}

vec3 sunDiskDirection(vec3 centerDirection, int index) {
  vec3 reference = abs(centerDirection.y) < 0.92 ? vec3(0.0, 1.0, 0.0) :
    vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(reference, centerDirection));
  vec3 bitangent = normalize(cross(centerDirection, tangent));
  vec2 diskPoint = sunDiskPoint(index) * SUN_DISK_RADIUS;
  return normalize(centerDirection + tangent * diskPoint.x + bitangent * diskPoint.y);
}

float ringShadowOnPlanet(
  vec3 point,
  vec3 pointDerivativeX,
  vec3 pointDerivativeY,
  vec3 lightDirection
) {
  if (uRingShadowStrength <= 0.0) return 1.0;
  float accumulatedTransmission = 0.0;

  for (int index = 0; index < SUN_DISK_SAMPLES; index += 1) {
    vec3 sampleDirection = sunDiskDirection(lightDirection, index);
    float safeLightY = sampleDirection.y < 0.0 ?
      min(sampleDirection.y, -0.0001) : max(sampleDirection.y, 0.0001);
    float distance = -point.y / safeLightY;
    vec3 projectedPoint = point + sampleDirection * distance;
    vec3 projectedDerivativeX = pointDerivativeX -
      sampleDirection * (pointDerivativeX.y / safeLightY);
    vec3 projectedDerivativeY = pointDerivativeY -
      sampleDirection * (pointDerivativeY.y / safeLightY);
    float projectedRadius = max(length(projectedPoint.xz), 0.000001);
    vec2 radialDirection = projectedPoint.xz / projectedRadius;
    float radiusRatio = projectedRadius / SATURN_RADIUS;
    float radiusDerivativeX = dot(radialDirection, projectedDerivativeX.xz) / SATURN_RADIUS;
    float radiusDerivativeY = dot(radialDirection, projectedDerivativeY.xz) / SATURN_RADIUS;
    float halfFootprint = max(
      0.5 * (abs(radiusDerivativeX) + abs(radiusDerivativeY)),
      0.000001
    );
    float transmission = integrateRingTransmission(
      radiusRatio,
      halfFootprint,
      abs(sampleDirection.y)
    );
    accumulatedTransmission += mix(1.0, transmission, step(0.001, distance));
  }

  float transmission = accumulatedTransmission / float(SUN_DISK_SAMPLES);
  return mix(1.0, transmission, clamp(uRingShadowStrength, 0.0, 1.0));
}

float planetVisibilityForSun(
  vec3 point,
  vec3 pointDerivativeX,
  vec3 pointDerivativeY,
  vec3 lightDirection,
  vec3 radii
) {
  vec3 origin = point + lightDirection * 0.002;
  vec3 inverseRadiiSquared = 1.0 / (radii * radii);
  float a = dot(lightDirection * lightDirection, inverseRadiiSquared);
  float b = 2.0 * dot(origin * lightDirection, inverseRadiiSquared);
  float c = dot(origin * origin, inverseRadiiSquared) - 1.0;
  float discriminant = b * b - 4.0 * a * c;
  float bDerivativeX = 2.0 * dot(pointDerivativeX * lightDirection, inverseRadiiSquared);
  float bDerivativeY = 2.0 * dot(pointDerivativeY * lightDirection, inverseRadiiSquared);
  float cDerivativeX = 2.0 * dot(origin * pointDerivativeX, inverseRadiiSquared);
  float cDerivativeY = 2.0 * dot(origin * pointDerivativeY, inverseRadiiSquared);
  float discriminantDerivativeX = 2.0 * b * bDerivativeX - 4.0 * a * cDerivativeX;
  float discriminantDerivativeY = 2.0 * b * bDerivativeY - 4.0 * a * cDerivativeY;
  float edgeWidth = max(
    (abs(discriminantDerivativeX) + abs(discriminantDerivativeY)) * 2.4,
    0.016
  );
  if (b >= 0.0 || discriminant <= -edgeWidth) return 1.0;
  float occlusion = smoothstep(-edgeWidth, edgeWidth, discriminant);
  return mix(1.0, 0.018, occlusion);
}

float planetShadowOnRing(
  vec3 point,
  vec3 pointDerivativeX,
  vec3 pointDerivativeY,
  vec3 lightDirection,
  vec3 radii
) {
  float accumulatedVisibility = 0.0;
  for (int index = 0; index < SUN_DISK_SAMPLES; index += 1) {
    accumulatedVisibility += planetVisibilityForSun(
      point,
      pointDerivativeX,
      pointDerivativeY,
      sunDiskDirection(lightDirection, index),
      radii
    );
  }
  return accumulatedVisibility / float(SUN_DISK_SAMPLES);
}

float saturnCloudDetail(float longitude, float latitude) {
  float latitudeNorm = latitude / (0.5 * PI);
  float wind = 0.38 + 0.24 * cos(latitude * 11.0) +
    0.12 * cos(latitude * 27.0 + 0.8);
  float advectedLongitude = longitude + uTime * uBandDrift * wind;
  vec3 domain = vec3(
    cos(advectedLongitude) * 2.2,
    sin(advectedLongitude) * 2.2,
    latitude * 31.0
  );
  float broad = valueNoise(domain);
  float filament = valueNoise(vec3(
    cos(advectedLongitude * 2.5) * 3.8,
    sin(advectedLongitude * 2.5) * 3.8,
    latitude * 78.0 + broad * 2.5
  ));
  float zonal = sin(latitude * 92.0 + broad * 4.2) * 0.32;
  float polarFade = smoothstep(0.02, 0.24, 1.0 - abs(latitudeNorm));
  return ((broad - 0.5) * 0.58 + (filament - 0.5) * 0.34 + zonal) * polarFade;
}

float northPolarHexagon(vec3 mappedDirection) {
  float latitude = asin(clamp(mappedDirection.y, -1.0, 1.0));
  float colatitude = 0.5 * PI - latitude;
  float angle = atan(mappedDirection.z, mappedDirection.x);
  float target = 0.255 + 0.014 * cos(angle * 6.0);
  float line = exp(-abs(colatitude - target) * 115.0);
  return line * smoothstep(1.02, 1.3, latitude);
}

vec3 cloudShadingNormal(vec3 geometricNormal, vec2 uv) {
  vec2 texel = 1.0 / vec2(textureSize(uAtmosphereTexture, 0));
  float west = textureLod(uAtmosphereTexture, uv - vec2(texel.x, 0.0), 0.0).a;
  float east = textureLod(uAtmosphereTexture, uv + vec2(texel.x, 0.0), 0.0).a;
  float south = textureLod(uAtmosphereTexture, uv - vec2(0.0, texel.y), 0.0).a;
  float north = textureLod(uAtmosphereTexture, uv + vec2(0.0, texel.y), 0.0).a;
  vec2 gradient = vec2(east - west, north - south);

  float horizontalLength = length(geometricNormal.xz);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  if (horizontalLength > 0.0001) {
    tangent = vec3(geometricNormal.z, 0.0, -geometricNormal.x) / horizontalLength;
  }
  vec3 bitangent = normalize(cross(geometricNormal, tangent));
  float normalStrength = 1.1 + uDetailIntensity * 5.5;
  return normalize(
    geometricNormal - tangent * gradient.x * normalStrength -
      bitangent * gradient.y * normalStrength * 0.72
  );
}

vec3 shadePlanet(
  vec3 point,
  vec3 pointDerivativeX,
  vec3 pointDerivativeY,
  vec3 rayDirection,
  vec3 lightDirection,
  vec3 radii,
  vec3 mappedDirection,
  vec3 mappedDirectionDerivativeX,
  vec3 mappedDirectionDerivativeY,
  float geometricIncidentFootprint
) {
  vec3 geometricNormal = normalize(point / (radii * radii));
  vec2 surfaceUv = sphereUv(mappedDirection);
  vec4 atmosphere = sampleEquirectangular(
    uAtmosphereTexture,
    mappedDirection,
    mappedDirectionDerivativeX,
    mappedDirectionDerivativeY
  );
  vec3 albedo = atmosphere.rgb;
  vec3 shadingNormal = cloudShadingNormal(geometricNormal, surfaceUv);
  float longitude = atan(mappedDirection.x, mappedDirection.z);
  float latitude = asin(clamp(mappedDirection.y, -1.0, 1.0));
  float atlasDetail = (atmosphere.a - 0.52) * 2.0;
  float detail = saturnCloudDetail(longitude, latitude) * uDetailIntensity * 0.45;
  float narrowBands = sin(latitude * 46.0 + detail * 5.0) * 0.5 +
    sin(latitude * 93.0 - detail * 3.0) * 0.18;
  albedo *= 1.0 + detail + atlasDetail * uBandContrast * 0.22 +
    narrowBands * uBandContrast * 0.045;
  albedo += detail * vec3(0.02, 0.013, 0.007);
  albedo *= 1.0 - northPolarHexagon(mappedDirection) * uPolarHexagon;
  albedo *= vec3(0.96, 0.99, 1.07);

  vec3 viewDirection = -rayDirection;
  float geometricViewCosine = max(dot(geometricNormal, viewDirection), 0.0);
  float geometricIncident = dot(geometricNormal, lightDirection);
  float terminatorWidth = max(geometricIncidentFootprint * 1.45, 0.0008);
  float dayVisibility = smoothstep(
    -0.11 - terminatorWidth,
    0.12 + terminatorWidth,
    geometricIncident
  );
  float shadingIncident = dot(shadingNormal, lightDirection);
  float wrappedIncident = max((shadingIncident + 0.065) / 1.065, 0.0);
  float incidentCosine = mix(max(shadingIncident, 0.0), wrappedIncident, 0.3);
  float cloudPhotometry = pow(incidentCosine, 0.82) * pow(geometricViewCosine, 0.24);
  float photometry = mix(
    incidentCosine,
    cloudPhotometry,
    clamp(uCloudPhotometricMix, 0.0, 1.0)
  );
  float backscatter = 1.0 + 0.1 * pow(max(dot(lightDirection, viewDirection), 0.0), 4.0);
  float ringTransmission = ringShadowOnPlanet(
    point,
    pointDerivativeX,
    pointDerivativeY,
    lightDirection
  );
  float directLighting = photometry * backscatter * ringTransmission;
  float twilight = smoothstep(-0.18, 0.32, geometricIncident);
  float multipleScattering = 0.05 * pow(twilight, 0.72) *
    mix(0.35, 1.0, ringTransmission);
  float lighting = 0.003 + directLighting * dayVisibility + multipleScattering;

  vec3 color = albedo * lighting;
  float limbPath = pow(1.0 - geometricViewCosine, 3.6);
  float hazeVisibility = dayVisibility * smoothstep(-0.16, 0.28, geometricIncident);
  color += vec3(0.92, 0.78, 0.57) * limbPath * hazeVisibility * uLimbHaze * 0.22;
  return color;
}

RingTransport shadeRing(
  vec3 point,
  vec3 pointDerivativeX,
  vec3 pointDerivativeY,
  float halfFootprint,
  vec3 rayDirection,
  vec3 lightDirection,
  vec3 radii
) {
  float radiusRatio = length(point.xz) / SATURN_RADIUS;
  float safeHalfFootprint = max(halfFootprint, 0.000001);
  float overlapStart = max(radiusRatio - safeHalfFootprint, uRingRadiusRange.x);
  float overlapEnd = min(radiusRatio + safeHalfFootprint, uRingRadiusRange.y);
  float overlap = max(overlapEnd - overlapStart, 0.0);
  float coverage = clamp(overlap / (2.0 * safeHalfFootprint), 0.0, 1.0);
  RingTransport result;
  result.radiance = vec3(0.0);
  result.transmission = 1.0;
  if (coverage <= 0.0) return result;

  float muView = max(abs(rayDirection.y), 0.045);
  float muSun = max(abs(lightDirection.y), 0.045);
  vec3 viewDirection = -rayDirection;
  float sameSide = step(0.0, lightDirection.y * viewDirection.y);
  float backAngle = max(dot(lightDirection, viewDirection), 0.0);
  float forwardAngle = max(dot(-lightDirection, viewDirection), 0.0);
  float backLobe = 0.88 + 0.32 * pow(backAngle, 5.0);
  float forwardLobe = 1.0 + uForwardScattering * 4.5 * pow(forwardAngle, 12.0);
  float planetVisibility = planetShadowOnRing(
    point,
    pointDerivativeX,
    pointDerivativeY,
    lightDirection,
    radii
  );
  float accumulatedTransmission = 0.0;
  vec3 accumulatedRadiance = vec3(0.0);

  for (int index = 0; index < RING_INTEGRATION_SAMPLES; index += 1) {
    float position = (float(index) + 0.5) / float(RING_INTEGRATION_SAMPLES);
    float sampleRadius = mix(overlapStart, overlapEnd, position);
    vec4 ringData = sampleRingData(sampleRadius, 0.0);
    float opticalDepth = ringOpticalDepth(ringData);
    float viewTransmission = exp(-opticalDepth / muView);
    float alpha = 1.0 - viewTransmission;
    float singleScatter = muSun / max(muSun + muView, 0.0001) *
      (1.0 - exp(-opticalDepth * (1.0 / muSun + 1.0 / muView)));
    float reflected = singleScatter * backLobe;
    float transmitted = alpha * (uUnlitRingBrightness + 0.16 * forwardLobe);
    float illuminated = mix(transmitted, reflected, sameSide);
    float shadowFill = alpha * uUnlitRingBrightness * 0.32;
    float sideLighting = mix(shadowFill, illuminated, planetVisibility);
    accumulatedTransmission += viewTransmission;
    accumulatedRadiance += ringData.rgb * sideLighting;
  }

  float inverseSamples = 1.0 / float(RING_INTEGRATION_SAMPLES);
  result.radiance = accumulatedRadiance * inverseSamples * coverage;
  result.transmission = mix(
    1.0,
    accumulatedTransmission * inverseSamples,
    coverage
  );
  return result;
}

AtmosphereTransport shadeAtmosphere(
  vec3 rayOrigin,
  vec3 rayDirection,
  vec3 lightDirection,
  vec3 radii,
  vec2 planetHit
) {
  AtmosphereTransport result;
  result.radiance = vec3(0.0);
  result.transmission = 1.0;
  result.nearDistance = 1000.0;
  if (uLimbHaze <= 0.0) return result;

  vec3 shellRadii = radii * (1.0 + ATMOSPHERE_THICKNESS);
  vec3 shellHit = rayEllipsoidInterval(rayOrigin, rayDirection, shellRadii);
  if (shellHit.x < 0.0 || shellHit.y <= shellHit.x || shellHit.z <= 0.0) return result;

  float nearDistance = max(shellHit.x, 0.0);
  float bodyEnd = planetHit.x > 0.0 ? min(planetHit.x, shellHit.y) : shellHit.y;
  float farDistance = mix(shellHit.y, bodyEnd, clamp(planetHit.y, 0.0, 1.0));
  float pathLength = max(farDistance - nearDistance, 0.0);
  if (pathLength <= 0.0) return result;

  float accumulatedDensity = 0.0;
  float accumulatedScattering = 0.0;
  vec3 viewDirection = -rayDirection;
  float phase = 0.34 + 0.66 * pow(max(dot(lightDirection, viewDirection), 0.0), 4.0);

  for (int index = 0; index < ATMOSPHERE_SAMPLES; index += 1) {
    float position = (float(index) + 0.5) / float(ATMOSPHERE_SAMPLES);
    vec3 samplePoint = rayOrigin + rayDirection * mix(nearDistance, farDistance, position);
    float ellipsoidRadius = length(samplePoint / radii);
    float altitude = max(ellipsoidRadius - 1.0, 0.0);
    float density = exp(-altitude * 3.4 / ATMOSPHERE_THICKNESS);
    vec3 sampleNormal = normalize(samplePoint / (radii * radii));
    float incident = dot(sampleNormal, lightDirection);
    float daylight = smoothstep(-0.2, 0.12, incident);
    accumulatedDensity += density;
    accumulatedScattering += density * daylight * phase;
  }

  float meanDensity = accumulatedDensity / float(ATMOSPHERE_SAMPLES);
  float normalizedPath = pathLength /
    max(SATURN_RADIUS * ATMOSPHERE_THICKNESS, 0.000001);
  float opticalDepth = meanDensity * normalizedPath * uLimbHaze * 0.72;
  float transmission = exp(-opticalDepth);
  float scattering = accumulatedScattering / max(accumulatedDensity, 0.0001);
  result.radiance = vec3(0.82, 0.69, 0.5) *
    (1.0 - transmission) * scattering * shellHit.z * 1.15;
  result.transmission = mix(1.0, transmission, shellHit.z);
  result.nearDistance = nearDistance;
  return result;
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
  // Shrink on wide composition boxes so the rings fit horizontally.
  float aspect = uCompositionSize.x / max(uCompositionSize.y, 1.0);
  float wideAspectShrink = mix(1.0, 0.54, smoothstep(1.0, 2.2, aspect));
  position *= wideAspectShrink;
  float tilt = uRingTilt + uPointer.y * 0.045;
  float roll = uAxialRoll + uPointer.x * 0.018;
  vec3 rayOrigin = viewToBody(vec3(position, 3.0), tilt, roll);
  vec3 rayDirection = normalize(viewToBody(vec3(0.0, 0.0, -1.0), tilt, roll));
  vec3 lightDirection = normalize(viewToBody(uSunDirectionView, tilt, roll));
  vec3 radii = vec3(
    SATURN_RADIUS,
    SATURN_RADIUS * (1.0 - clamp(uFlattening, 0.0, 0.2)),
    SATURN_RADIUS
  );

  vec2 planetHit = rayEllipsoidWithCoverage(rayOrigin, rayDirection, radii);
  vec3 planetPoint = rayOrigin + rayDirection * planetHit.x;
  vec3 planetPointDerivativeX = dFdx(planetPoint);
  vec3 planetPointDerivativeY = dFdy(planetPoint);
  vec3 radialDirection = normalize(planetPoint / radii);
  float baseLatitude = asin(clamp(radialDirection.y, -1.0, 1.0));
  float differentialWind = 0.42 + 0.22 * cos(baseLatitude * 10.0) +
    0.08 * cos(baseLatitude * 24.0 + 0.7);
  vec3 mappedDirection = rotateY(
    radialDirection,
    uLongitudeOffset + uYaw + uPointer.x * 0.1 +
      uTime * uBandDrift * differentialWind
  );
  vec3 mappedDirectionDerivativeX = dFdx(mappedDirection);
  vec3 mappedDirectionDerivativeY = dFdy(mappedDirection);
  vec3 planetGeometricNormal = normalize(planetPoint / (radii * radii));
  float geometricIncident = dot(planetGeometricNormal, lightDirection);
  float geometricIncidentFootprint = abs(dFdx(geometricIncident)) +
    abs(dFdy(geometricIncident));
  bool hasPlanet = planetHit.x > 0.0 && planetHit.y > 0.0;
  vec3 planetColor = vec3(0.0);
  if (hasPlanet) {
    planetColor = shadePlanet(
      planetPoint,
      planetPointDerivativeX,
      planetPointDerivativeY,
      rayDirection,
      lightDirection,
      radii,
      mappedDirection,
      mappedDirectionDerivativeX,
      mappedDirectionDerivativeY,
      geometricIncidentFootprint
    );
  }
  AtmosphereTransport atmosphereLayer = shadeAtmosphere(
    rayOrigin,
    rayDirection,
    lightDirection,
    radii,
    planetHit
  );
  vec3 planetLayerRadiance = atmosphereLayer.radiance +
    atmosphereLayer.transmission * planetColor * planetHit.y;
  float planetLayerAlpha = (1.0 - atmosphereLayer.transmission) +
    atmosphereLayer.transmission * planetHit.y;
  bool hasPlanetLayer = planetLayerAlpha > 0.0001;
  float planetFrontDistance = atmosphereLayer.transmission < 0.9999 ?
    atmosphereLayer.nearDistance : planetHit.x;

  float safeRayY = rayDirection.y < 0.0 ?
    min(rayDirection.y, -0.0001) : max(rayDirection.y, 0.0001);
  float ringDistance = -rayOrigin.y / safeRayY;
  vec3 ringPoint = rayOrigin + rayDirection * ringDistance;
  vec3 ringPointDerivativeX = dFdx(ringPoint);
  vec3 ringPointDerivativeY = dFdy(ringPoint);
  float ringRadiusRatio = length(ringPoint.xz) / SATURN_RADIUS;
  float ringHalfFootprint = max(
    0.5 * (abs(dFdx(ringRadiusRatio)) + abs(dFdy(ringRadiusRatio))),
    0.000001
  );
  bool hasRing = abs(rayDirection.y) > 0.0001 && ringDistance > 0.0 &&
    ringRadiusRatio + ringHalfFootprint >= uRingRadiusRange.x &&
    ringRadiusRatio - ringHalfFootprint <= uRingRadiusRange.y;

  RingTransport ringLayer;
  ringLayer.radiance = vec3(0.0);
  ringLayer.transmission = 1.0;
  if (hasRing) {
    ringLayer = shadeRing(
      ringPoint,
      ringPointDerivativeX,
      ringPointDerivativeY,
      ringHalfFootprint,
      rayDirection,
      lightDirection,
      radii
    );
    hasRing = ringLayer.transmission < 0.9999 || length(ringLayer.radiance) > 0.0001;
  }

  vec3 linearPremultiplied = vec3(0.0);
  float alpha = 0.0;
  if (hasPlanetLayer && hasRing) {
    if (ringDistance < planetFrontDistance) {
      linearPremultiplied = ringLayer.radiance +
        ringLayer.transmission * planetLayerRadiance;
      alpha = (1.0 - ringLayer.transmission) +
        ringLayer.transmission * planetLayerAlpha;
    } else {
      linearPremultiplied = planetLayerRadiance +
        ringLayer.radiance * (1.0 - planetLayerAlpha);
      alpha = planetLayerAlpha +
        (1.0 - ringLayer.transmission) * (1.0 - planetLayerAlpha);
    }
  } else if (hasPlanetLayer) {
    linearPremultiplied = planetLayerRadiance;
    alpha = planetLayerAlpha;
  } else if (hasRing) {
    linearPremultiplied = ringLayer.radiance;
    alpha = 1.0 - ringLayer.transmission;
  } else {
    fragColor = vec4(0.0);
    return;
  }

  vec3 linearColor = linearPremultiplied / max(alpha, 0.0001);
  linearColor = filmic(linearColor * uExposure);
  linearColor = pow(linearColor, vec3(1.0 / 2.2));
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  linearColor = clamp(linearColor + dither, 0.0, 1.0);
  fragColor = vec4(linearColor * alpha, alpha);
}
`

const spec: OrbRendererSpec<SaturnResources, SaturnFrameSettings, SaturnSurface> = {
  label: 'Saturn',
  // Thin tilted rings need supersampling even on 1× displays.
  minDevicePixelRatio: 2,
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Saturn')
    return {
      atmosphereTexture: createTexture(gl, 'Saturn atmosphere', {
        internalFormat: gl.SRGB8_ALPHA8,
        placeholder: [255, 255, 255, 255],
      }),
      longitudeOffset: 0,
      program,
      ringRadiusRange: DEFAULT_RING_RADIUS_RANGE,
      ringTexture: createTexture(gl, 'Saturn rings', {
        placeholder: [0, 0, 0, 0],
        wrapS: gl.CLAMP_TO_EDGE,
      }),
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Saturn'),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteTexture(resources.atmosphereTexture)
    gl.deleteTexture(resources.ringTexture)
    gl.deleteProgram(resources.program)
    gl.deleteVertexArray(resources.vertexArray)
  },
  upload(gl, resources, surface) {
    withUnpackState(gl, { flipY: true, premultiplyAlpha: false }, () => {
      uploadImage(gl, resources.atmosphereTexture, surface.atmosphere, {
        internalFormat: gl.SRGB8_ALPHA8,
      })
      uploadImage(gl, resources.ringTexture, surface.rings)
    })
    resources.longitudeOffset = degreesToRadians(surface.longitudeOffsetDegrees ?? 0)
    resources.ringRadiusRange = [surface.ringRadiusRange[0], surface.ringRadiusRange[1]]
  },
  // Time only enters the shader through `uYaw` (spin) and `uTime * uBandDrift`.
  isAnimated: (settings) => settings.spin !== 0 || settings.bandDrift !== 0,
  render(gl, resources, frame) {
    const { composition, elapsed, hasSource, pointerX, pointerY, settings } = frame
    const { uniforms } = resources

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.atmosphereTexture)
    gl.uniform1i(uniforms.uAtmosphereTexture, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, resources.ringTexture)
    gl.uniform1i(uniforms.uRingTexture, 1)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform2f(uniforms.uCompositionSize, composition.width, composition.height)
    gl.uniform1f(uniforms.uAxialRoll, degreesToRadians(settings.axialRoll))
    gl.uniform1f(uniforms.uBandContrast, settings.bandContrast)
    gl.uniform1f(uniforms.uCloudPhotometricMix, settings.cloudPhotometricMix)
    gl.uniform1f(uniforms.uDetailIntensity, settings.detailIntensity)
    gl.uniform1f(uniforms.uBandDrift, degreesToRadians(settings.bandDrift))
    gl.uniform1f(uniforms.uExposure, settings.exposure)
    gl.uniform1f(uniforms.uForwardScattering, settings.forwardScattering)
    gl.uniform1f(uniforms.uLimbHaze, settings.limbHaze)
    gl.uniform1f(uniforms.uLongitudeOffset, resources.longitudeOffset)
    gl.uniform1f(uniforms.uFlattening, settings.flattening / 100)
    gl.uniform1f(uniforms.uPolarHexagon, settings.polarHexagon)
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(uniforms.uRingOpacity, settings.ringOpacity)
    gl.uniform2f(uniforms.uRingRadiusRange, ...resources.ringRadiusRange)
    gl.uniform1f(uniforms.uRingShadowStrength, settings.ringShadowStrength)
    gl.uniform1f(uniforms.uRingTilt, degreesToRadians(settings.tilt))
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform3f(
      uniforms.uSunDirectionView,
      ...sunDirection(settings.sunAzimuth, settings.sunElevation),
    )
    gl.uniform1f(uniforms.uYaw, degreesToRadians(settings.yaw + elapsed * settings.spin))
    gl.uniform1f(uniforms.uTime, elapsed)
    gl.uniform1f(uniforms.uUnlitRingBrightness, settings.unlitRingBrightness)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function SaturnOrbEffect({
  axialRoll = -8,
  bandContrast = 0.12,
  bandDrift = 1,
  className,
  cloudPhotometricMix = 0.42,
  composition,
  detailIntensity = 0.06,
  exposure = 0.96,
  flattening = 9.8,
  forwardScattering = 0.35,
  lean = true,
  limbHaze = 0.1,
  onError,
  paused,
  polarHexagon = 0.14,
  ringOpacity = 1,
  ringShadowStrength = 0.82,
  source,
  spin = 1,
  style,
  sunAzimuth = -38,
  sunElevation = -8,
  tilt = 26,
  unlitRingBrightness = 0.08,
  viewport,
  yaw = 0,
}: SaturnOrbEffectProps) {
  const settings: SaturnFrameSettings = {
    axialRoll,
    bandContrast,
    bandDrift,
    cloudPhotometricMix,
    detailIntensity,
    exposure,
    flattening,
    forwardScattering,
    lean,
    limbHaze,
    polarHexagon,
    ringOpacity,
    ringShadowStrength,
    spin,
    tilt,
    sunAzimuth,
    sunElevation,
    yaw,
    unlitRingBrightness,
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
