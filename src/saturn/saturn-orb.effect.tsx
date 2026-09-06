'use client'

// Requires: react

import { type CSSProperties } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'
import { getUniformLocations, type UniformLocations } from '../internal/uniforms'

export type SaturnOrbSource = {
  ready?: () => Promise<void>
  render: () => {
    atmosphere: TexImageSource
    longitudeOffsetDegrees?: number
    ringRadiusRange: readonly [innerEquatorialRadii: number, outerEquatorialRadii: number]
    rings: TexImageSource
  } | null
}

export type SaturnOrbEffectProps = {
  axialRoll?: number
  bandContrast?: number
  bandDrift?: number
  className?: string
  cloudPhotometricMix?: number
  detailIntensity?: number
  exposure?: number
  flattening?: number
  forwardScatter?: number
  lean?: boolean
  limbHaze?: number
  polarHexagon?: number
  ringOpacity?: number
  ringShadowStrength?: number
  source: SaturnOrbSource
  tilt?: number
  spin?: number
  style?: CSSProperties
  sunAzimuth?: number
  sunElevation?: number
  yaw?: number
  unlitRingBrightness?: number
}

const UNIFORM_NAMES = [
  'uAtmosphereTexture',
  'uAxialRoll',
  'uBandContrast',
  'uBandDrift',
  'uCloudPhotometricMix',
  'uDetailIntensity',
  'uExposure',
  'uFlattening',
  'uForwardScatter',
  'uLimbHaze',
  'uLongitudeOffset',
  'uPointer',
  'uPolarHexagon',
  'uResolution',
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
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  ringTexture: WebGLTexture
  vertexArray: WebGLVertexArrayObject
}

type AnisotropyExtension = {
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
  TEXTURE_MAX_ANISOTROPY_EXT: number
}

type SaturnFrameSettings = {
  axialRoll: number
  bandContrast: number
  bandDrift: number
  cloudPhotometricMix: number
  detailIntensity: number
  exposure: number
  flattening: number
  forwardScatter: number
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

uniform sampler2D uAtmosphereTexture;
uniform float uAxialRoll;
uniform float uBandContrast;
uniform float uCloudPhotometricMix;
uniform float uDetailIntensity;
uniform float uBandDrift;
uniform float uExposure;
uniform float uForwardScatter;
uniform float uLimbHaze;
uniform float uLongitudeOffset;
uniform float uFlattening;
uniform float uPolarHexagon;
uniform vec2 uPointer;
uniform vec2 uResolution;
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
  float forwardLobe = 1.0 + uForwardScatter * 4.5 * pow(forwardAngle, 12.0);
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

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 position = (vUv * 2.0 - 1.0) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0));
  float compositionScale = mix(1.0, 0.54, smoothstep(1.0, 2.2, aspect));
  position *= compositionScale;
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

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Saturn shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Saturn shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create Saturn shader program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown Saturn shader link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function createTexture(
  gl: WebGL2RenderingContext,
  pixel: readonly [number, number, number, number],
  wrapS: number,
): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Unable to create Saturn texture')
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.generateMipmap(gl.TEXTURE_2D)
  return texture
}

function createResources(gl: WebGL2RenderingContext): SaturnResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Saturn vertex array')
  const program = createProgram(gl)
  const resources = {
    atmosphereTexture: createTexture(gl, [255, 255, 255, 255], gl.REPEAT),
    program,
    uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
    ringTexture: createTexture(gl, [0, 0, 0, 0], gl.CLAMP_TO_EDGE),
    vertexArray,
  }
  gl.bindVertexArray(vertexArray)
  return resources
}

function deleteResources(gl: WebGL2RenderingContext, resources: SaturnResources): void {
  gl.deleteTexture(resources.atmosphereTexture)
  gl.deleteTexture(resources.ringTexture)
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: TexImageSource,
  internalFormat: number,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, image)
  gl.generateMipmap(gl.TEXTURE_2D)
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic') as AnisotropyExtension | null
  if (anisotropy) {
    const maximum = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
    gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(maximum, 8))
  }
}

function createSaturnRenderer(
  canvas: HTMLCanvasElement,
  source: SaturnOrbSource,
): CanvasRenderer<SaturnFrameSettings> | null {
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
  let resources = createResources(gl)
  let ringRadiusRange = [66900 / 60268, 140500 / 60268] as [number, number]
  let startTime = performance.now()
  let lastTime = startTime
  const pointer = { currentX: 0, currentY: 0, targetX: 0, targetY: 0, velocityX: 0, velocityY: 0 }

  function uploadSource(): void {
    if (disposed || contextLost) return
    const saturn = source.render()
    if (!saturn) {
      hasSource = false
      return
    }

    const previousFlip = Boolean(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL))
    const previousPremultiply = Boolean(gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL))
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    uploadTexture(gl, resources.atmosphereTexture, saturn.atmosphere, gl.SRGB8_ALPHA8)
    uploadTexture(gl, resources.ringTexture, saturn.rings, gl.RGBA8)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
    hasSource = true
    longitudeOffset = ((saturn.longitudeOffsetDegrees ?? 0) * Math.PI) / 180
    ringRadiusRange = [saturn.ringRadiusRange[0], saturn.ringRadiusRange[1]]
  }

  function resize(): void {
    const bounds = canvas.getBoundingClientRect()
    // Thin tilted rings need supersampling even on 1× displays.
    const dpr = 2
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

  function render(timestamp: number, current: SaturnFrameSettings): void {
    if (contextLost) return
    resize()
    const elapsed = (timestamp - startTime) / 1000
    const delta = Math.min((timestamp - lastTime) / 1000, 0.05)
    lastTime = timestamp
    updatePointer(delta, current.lean)
    const azimuth = (current.sunAzimuth * Math.PI) / 180
    const elevation = (current.sunElevation * Math.PI) / 180
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
    gl.bindTexture(gl.TEXTURE_2D, resources.atmosphereTexture)
    gl.uniform1i(resources.uniforms.uAtmosphereTexture, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, resources.ringTexture)
    gl.uniform1i(resources.uniforms.uRingTexture, 1)
    gl.uniform1f(resources.uniforms.uAxialRoll, (current.axialRoll * Math.PI) / 180)
    gl.uniform1f(resources.uniforms.uBandContrast, current.bandContrast)
    gl.uniform1f(resources.uniforms.uCloudPhotometricMix, current.cloudPhotometricMix)
    gl.uniform1f(resources.uniforms.uDetailIntensity, current.detailIntensity)
    gl.uniform1f(resources.uniforms.uBandDrift, (current.bandDrift * Math.PI) / 180)
    gl.uniform1f(resources.uniforms.uExposure, current.exposure)
    gl.uniform1f(resources.uniforms.uForwardScatter, current.forwardScatter)
    gl.uniform1f(resources.uniforms.uLimbHaze, current.limbHaze)
    gl.uniform1f(resources.uniforms.uLongitudeOffset, longitudeOffset)
    gl.uniform1f(resources.uniforms.uFlattening, current.flattening / 100)
    gl.uniform1f(resources.uniforms.uPolarHexagon, current.polarHexagon)
    gl.uniform2f(resources.uniforms.uPointer, pointer.currentX, pointer.currentY)
    gl.uniform2f(resources.uniforms.uResolution, canvas.width, canvas.height)
    gl.uniform1f(resources.uniforms.uRingOpacity, current.ringOpacity)
    gl.uniform2f(resources.uniforms.uRingRadiusRange, ...ringRadiusRange)
    gl.uniform1f(resources.uniforms.uRingShadowStrength, current.ringShadowStrength)
    gl.uniform1f(resources.uniforms.uRingTilt, (current.tilt * Math.PI) / 180)
    gl.uniform1f(resources.uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform3f(resources.uniforms.uSunDirectionView, ...sunDirection)
    gl.uniform1f(resources.uniforms.uYaw, ((current.yaw + elapsed * current.spin) * Math.PI) / 180)
    gl.uniform1f(resources.uniforms.uTime, elapsed)
    gl.uniform1f(resources.uniforms.uUnlitRingBrightness, current.unlitRingBrightness)
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
    ringRadiusRange = [66900 / 60268, 140500 / 60268]
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

export function SaturnOrbEffect({
  axialRoll = -8,
  bandContrast = 0.12,
  bandDrift = 1,
  className,
  cloudPhotometricMix = 0.42,
  detailIntensity = 0.06,
  exposure = 0.96,
  flattening = 9.8,
  forwardScatter = 0.35,
  lean = true,
  limbHaze = 0.1,
  polarHexagon = 0.14,
  ringOpacity = 1,
  ringShadowStrength = 0.82,
  tilt = 26,
  source,
  spin = 1,
  style,
  sunAzimuth = -38,
  sunElevation = -8,
  yaw = 0,
  unlitRingBrightness = 0.08,
}: SaturnOrbEffectProps) {
  const frameSettings: SaturnFrameSettings = {
    axialRoll,
    bandContrast,
    bandDrift,
    cloudPhotometricMix,
    detailIntensity,
    exposure,
    flattening,
    forwardScatter,
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
  const canvasRef = useCanvasRenderer(frameSettings, source, createSaturnRenderer)

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', touchAction: 'pan-y', width: '100%', ...style }}
    />
  )
}
