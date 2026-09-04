'use client'

// Requires: react

import { type CSSProperties } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

/*
 * The atmospheric transport in this Effect is a WebGL2 adaptation of Fernando
 * García Liñán's four-wavelength Earth-sky model as converted for Blender.
 *
 * SPDX-FileCopyrightText: 2022 Fernando García Liñán
 * SPDX-FileCopyrightText: 2011-2025 Blender Authors
 * SPDX-License-Identifier: MIT
 *
 * The React lifecycle, WebGL resource management, observer optics, camera, and
 * final display pass are original to this standalone Effect.
 */

export type SolarSkyEffectProps = {
  /** Molecular density multiplier. */
  airDensity?: number
  /** Aerosol absorption multiplier, independent of aerosol scattering density. */
  aerosolAbsorption?: number
  /** Aerosol density multiplier. */
  aerosolDensity?: number
  /** Henyey-Greenstein anisotropy. Higher values tighten the solar aureole. */
  aerosolAnisotropy?: number
  /** Bounded display gain around the physically scattered circumsolar radiance. */
  aureole?: number
  className?: string
  /** Vertical camera field of view in degrees. */
  fieldOfView?: number
  /** Reflectance used by the fitted second-order ground bounce. */
  groundAlbedo?: number
  /** Local terrain horizon elevation in degrees. */
  horizonElevation?: number
  /** Observer altitude above sea level in metres. */
  observerAltitude?: number
  /** Ozone density multiplier. */
  ozoneDensity?: number
  /** NOAA apparent-elevation correction multiplier. */
  refraction?: number
  /** Refractive shimmer amplitude in arcminutes. */
  seeingAmount?: number
  /** Refractive shimmer speed multiplier. */
  seeingSpeed?: number
  /** True solar-centre elevation in degrees. */
  sunElevation?: number
  /** Editorial disk-size multiplier; 1 preserves the Sun's physical 0.53° diameter. */
  sunScale?: number
  /** Horizontal Sun placement in normalized half-frame units. */
  sunX?: number
  style?: CSSProperties
  /** Linear scene exposure before tone mapping. */
  exposure?: number
}

type SolarSkySettings = {
  airDensity: number
  aerosolAbsorption: number
  aerosolAnisotropy: number
  aerosolDensity: number
  aureole: number
  exposure: number
  fieldOfView: number
  groundAlbedo: number
  horizonElevation: number
  observerAltitude: number
  ozoneDensity: number
  refraction: number
  seeingAmount: number
  seeingSpeed: number
  sunElevation: number
  sunScale: number
  sunX: number
}

type RenderTarget = {
  framebuffer: WebGLFramebuffer
  size: number
  texture: WebGLTexture
}

type SolarSkyResources = {
  finalProgram: WebGLProgram
  highSky: RenderTarget
  lowSky: RenderTarget
  skyProgram: WebGLProgram
  transmittance: RenderTarget
  transmittanceProgram: WebGLProgram
  vertexArray: WebGLVertexArrayObject
}

const TRANSMITTANCE_WIDTH = 256
const TRANSMITTANCE_HEIGHT = 64
const LOW_SKY_SIZE = 128
const HIGH_SKY_SIZE = 256
const SETTLE_DELAY_MS = 140
const SOLAR_SKY_INPUT = null

const VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const ATMOSPHERE_GLSL = `
const float PI = 3.141592653589793;
const float INV_PI = 0.318309886183791;
const float INV_FOUR_PI = 0.079577471545948;
const float EARTH_RADIUS = 6371.0;
const float ATMOSPHERE_THICKNESS = 100.0;
const float ATMOSPHERE_RADIUS = 6471.0;
const vec4 SUN_SPECTRAL_IRRADIANCE = vec4(1.679, 1.828, 1.986, 1.307);
const vec4 MOLECULAR_SCATTERING_BASE = vec4(6.605e-3, 1.067e-2, 1.842e-2, 3.156e-2);
const vec4 OZONE_ABSORPTION_CROSS_SECTION = vec4(3.472e-25, 3.914e-25, 1.349e-25, 11.03e-27);
const vec4 AEROSOL_ABSORPTION_CROSS_SECTION = vec4(2.8722e-24, 4.6168e-24, 7.9706e-24, 1.3578e-23);
const vec4 AEROSOL_SCATTERING_CROSS_SECTION = vec4(1.5908e-22, 1.7711e-22, 2.0942e-22, 2.4033e-22);

uniform float uAirDensity;
uniform float uAerosolAbsorption;
uniform float uAerosolAnisotropy;
uniform float uAerosolDensity;
uniform float uGroundAlbedo;
uniform float uOzoneDensity;

float raySphereIntersection(vec3 origin, vec3 direction, float radius) {
  float b = dot(origin, direction);
  float c = dot(origin, origin) - radius * radius;
  if (c > 0.0 && b > 0.0) return -1.0;
  float discriminant = b * b - c;
  if (discriminant < 0.0) return -1.0;
  float root = sqrt(discriminant);
  return discriminant >= b * b ? -b + root : -b - root;
}

vec3 directionFromZenithCosine(float cosine) {
  return vec3(sqrt(max(1.0 - cosine * cosine, 0.0)), 0.0, cosine);
}

vec4 molecularScattering(float altitude) {
  return MOLECULAR_SCATTERING_BASE *
    exp(-0.07771971 * pow(max(altitude, 0.0), 1.16364243)) * uAirDensity;
}

vec4 molecularAbsorption(float altitude) {
  float logarithmicAltitude = log(max(altitude, 1e-4));
  float density = 3.78547397e20 * exp(
    -pow(logarithmicAltitude - 3.22261, 2.0) * 5.55555555 - logarithmicAltitude
  );
  return OZONE_ABSORPTION_CROSS_SECTION * 334.5 * density * uOzoneDensity;
}

float aerosolParticleDensity(float altitude) {
  return 1.3681e20 * (exp(-max(altitude, 0.0) / 0.73) + 2e6 / 1.3681e20) *
    uAerosolDensity;
}

void collisionCoefficients(
  float altitude,
  out vec4 aerosolAbsorption,
  out vec4 aerosolScattering,
  out vec4 molecularAbsorptionResult,
  out vec4 molecularScatteringResult
) {
  float aerosolDensity = aerosolParticleDensity(altitude);
  aerosolAbsorption = AEROSOL_ABSORPTION_CROSS_SECTION * aerosolDensity *
    uAerosolAbsorption;
  aerosolScattering = AEROSOL_SCATTERING_CROSS_SECTION * aerosolDensity;
  molecularAbsorptionResult = molecularAbsorption(altitude);
  molecularScatteringResult = molecularScattering(altitude);
}

vec3 spectralToXyz(vec4 spectrum) {
  return
    vec3(53.3869177386, 22.9813375067, 0.0) * spectrum.x +
    vec3(43.9048444664, 71.3477957001, 0.1025068680) * spectrum.y +
    vec3(1.6137278252, 18.4229605915, 31.7429211884) * spectrum.z +
    vec3(20.7626686738, 2.3614213523, 110.4800964325) * spectrum.w;
}
`

const TRANSMITTANCE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

${ATMOSPHERE_GLSL}

out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5) / vec2(
    float(${TRANSMITTANCE_WIDTH - 1}),
    float(${TRANSMITTANCE_HEIGHT - 1})
  );
  float zenithCosine = uv.x * 2.0 - 1.0;
  vec3 direction = directionFromZenithCosine(zenithCosine);
  vec3 origin = vec3(0.0, 0.0, mix(EARTH_RADIUS, ATMOSPHERE_RADIUS, uv.y));
  float distance = raySphereIntersection(origin, direction, ATMOSPHERE_RADIUS);
  float stepLength = distance / 64.0;
  vec4 opticalDepth = vec4(0.0);

  for (int stepIndex = 0; stepIndex < 64; stepIndex += 1) {
    float distanceAlongRay = (float(stepIndex) + 0.5) * stepLength;
    vec3 samplePosition = origin + direction * distanceAlongRay;
    float altitude = max(length(samplePosition) - EARTH_RADIUS, 0.0);
    vec4 aerosolAbsorption;
    vec4 aerosolScattering;
    vec4 ozoneAbsorption;
    vec4 airScattering;
    collisionCoefficients(
      altitude,
      aerosolAbsorption,
      aerosolScattering,
      ozoneAbsorption,
      airScattering
    );
    opticalDepth += (
      aerosolAbsorption + aerosolScattering + ozoneAbsorption + airScattering
    ) * stepLength;
  }

  fragColor = exp(-opticalDepth);
}
`

const SKY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

${ATMOSPHERE_GLSL}

uniform float uObserverAltitude;
uniform float uSkyResolution;
uniform float uSunElevation;
uniform sampler2D uTransmittanceTexture;

out vec4 fragColor;

vec4 sampleTransmittance(float zenithCosine, float normalizedAltitude) {
  vec2 position = vec2(
    clamp(zenithCosine * 0.5 + 0.5, 0.0, 1.0) * float(${TRANSMITTANCE_WIDTH - 1}),
    clamp(normalizedAltitude, 0.0, 1.0) * float(${TRANSMITTANCE_HEIGHT - 1})
  );
  ivec2 lower = ivec2(floor(position));
  ivec2 upper = min(lower + 1, ivec2(${TRANSMITTANCE_WIDTH - 1}, ${TRANSMITTANCE_HEIGHT - 1}));
  vec2 fraction = fract(position);
  vec4 bottom = mix(
    texelFetch(uTransmittanceTexture, ivec2(lower.x, lower.y), 0),
    texelFetch(uTransmittanceTexture, ivec2(upper.x, lower.y), 0),
    fraction.x
  );
  vec4 top = mix(
    texelFetch(uTransmittanceTexture, ivec2(lower.x, upper.y), 0),
    texelFetch(uTransmittanceTexture, ivec2(upper.x, upper.y), 0),
    fraction.x
  );
  return mix(bottom, top, fraction.y);
}

float molecularPhase(float cosine) {
  return (3.0 / (16.0 * PI)) * (1.0 + cosine * cosine);
}

float aerosolPhase(float cosine) {
  float squaredAnisotropy = uAerosolAnisotropy * uAerosolAnisotropy;
  float denominator = 1.0 + squaredAnisotropy + 2.0 * uAerosolAnisotropy * cosine;
  return INV_FOUR_PI * (1.0 - squaredAnisotropy) /
    max(denominator * sqrt(max(denominator, 1e-6)), 1e-6);
}

vec4 multipleScattering(float sunZenithCosine, float normalizedAltitude, float radius) {
  float radiusRatio = clamp(EARTH_RADIUS / radius, 0.0, 1.0);
  float planetSolidAngle = 2.0 * PI * (1.0 - sqrt(max(1.0 - radiusRatio * radiusRatio, 0.0)));
  vec4 transmittanceToGround = sampleTransmittance(sunZenithCosine, 0.0);
  vec4 transmittanceGroundToSample = sampleTransmittance(1.0, 0.0) /
    max(sampleTransmittance(1.0, normalizedAltitude), vec4(1e-6));
  vec4 groundRadiance = INV_FOUR_PI * planetSolidAngle *
    (vec4(uGroundAlbedo) * INV_PI) * transmittanceToGround *
    transmittanceGroundToSample * max(sunZenithCosine, 0.0);
  vec4 fittedRadiance = 0.02 * vec4(0.217, 0.347, 0.594, 1.0) /
    (1.0 + 5.0 * exp(-17.92 * sunZenithCosine));
  return fittedRadiance + groundRadiance;
}

void main() {
  float cacheX = (gl_FragCoord.x - 0.5) / max(uSkyResolution - 1.0, 1.0);
  float cacheY = gl_FragCoord.y / uSkyResolution;
  float azimuth = PI * cacheX;
  float elevationCoordinate = cacheY * 2.0 - 1.0;
  float elevation = sign(elevationCoordinate) * elevationCoordinate * elevationCoordinate * PI * 0.5;
  vec3 rayDirection = vec3(
    cos(elevation) * cos(azimuth),
    cos(elevation) * sin(azimuth),
    sin(elevation)
  );
  vec3 sunDirection = vec3(cos(uSunElevation), 0.0, sin(uSunElevation));
  vec3 rayOrigin = vec3(0.0, 0.0, EARTH_RADIUS + uObserverAltitude);
  float atmosphereDistance = raySphereIntersection(rayOrigin, rayDirection, ATMOSPHERE_RADIUS);
  float groundDistance = raySphereIntersection(rayOrigin, rayDirection, EARTH_RADIUS);
  float rayDistance = groundDistance < 0.0 ? atmosphereDistance : groundDistance;
  float stepLength = rayDistance / 64.0;
  float phaseCosine = dot(-rayDirection, sunDirection);
  float airPhase = molecularPhase(phaseCosine);
  float hazePhase = aerosolPhase(phaseCosine);
  vec4 radiance = vec4(0.0);
  vec4 viewTransmittance = vec4(1.0);

  for (int stepIndex = 0; stepIndex < 64; stepIndex += 1) {
    float distanceAlongRay = (float(stepIndex) + 0.5) * stepLength;
    vec3 samplePosition = rayOrigin + rayDirection * distanceAlongRay;
    float radius = length(samplePosition);
    vec3 zenithDirection = samplePosition / radius;
    float altitude = max(radius - EARTH_RADIUS, 0.0);
    float normalizedAltitude = altitude / ATMOSPHERE_THICKNESS;
    float sunZenithCosine = dot(zenithDirection, sunDirection);
    vec4 aerosolAbsorption;
    vec4 aerosolScattering;
    vec4 ozoneAbsorption;
    vec4 airScattering;
    collisionCoefficients(
      altitude,
      aerosolAbsorption,
      aerosolScattering,
      ozoneAbsorption,
      airScattering
    );
    vec4 extinction = aerosolAbsorption + aerosolScattering + ozoneAbsorption + airScattering;
    vec4 transmittanceToSun = sampleTransmittance(sunZenithCosine, normalizedAltitude);
    vec4 scatteredAgain = multipleScattering(sunZenithCosine, normalizedAltitude, radius);
    vec4 source = SUN_SPECTRAL_IRRADIANCE * (
      airScattering * (airPhase * transmittanceToSun + scatteredAgain) +
      aerosolScattering * (hazePhase * transmittanceToSun + scatteredAgain)
    );
    vec4 stepTransmittance = exp(-stepLength * extinction);
    vec4 safeExtinction = max(extinction, vec4(1e-7));
    vec4 integratedSource = (source - source * stepTransmittance) / safeExtinction;
    radiance += viewTransmittance * integratedSource;
    viewTransmittance *= stepTransmittance;
  }

  fragColor = vec4(spectralToXyz(max(radiance, vec4(0.0))), 1.0);
}
`

const FINAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

${ATMOSPHERE_GLSL}

uniform float uAureole;
uniform float uCacheResolution;
uniform float uExposure;
uniform float uFieldOfView;
uniform float uHorizonElevation;
uniform float uObserverAltitude;
uniform float uRefraction;
uniform vec2 uResolution;
uniform float uSeeingAmount;
uniform float uSeeingSpeed;
uniform sampler2D uSkyTexture;
uniform float uSunElevation;
uniform float uSunScale;
uniform float uSunX;
uniform float uTime;
uniform sampler2D uTransmittanceTexture;

out vec4 fragColor;

vec4 sampleTransmittance(float zenithCosine, float normalizedAltitude) {
  vec2 position = vec2(
    clamp(zenithCosine * 0.5 + 0.5, 0.0, 1.0) * float(${TRANSMITTANCE_WIDTH - 1}),
    clamp(normalizedAltitude, 0.0, 1.0) * float(${TRANSMITTANCE_HEIGHT - 1})
  );
  ivec2 lower = ivec2(floor(position));
  ivec2 upper = min(lower + 1, ivec2(${TRANSMITTANCE_WIDTH - 1}, ${TRANSMITTANCE_HEIGHT - 1}));
  vec2 fraction = fract(position);
  vec4 bottom = mix(
    texelFetch(uTransmittanceTexture, ivec2(lower.x, lower.y), 0),
    texelFetch(uTransmittanceTexture, ivec2(upper.x, lower.y), 0),
    fraction.x
  );
  vec4 top = mix(
    texelFetch(uTransmittanceTexture, ivec2(lower.x, upper.y), 0),
    texelFetch(uTransmittanceTexture, ivec2(upper.x, upper.y), 0),
    fraction.x
  );
  return mix(bottom, top, fraction.y);
}

vec3 sampleSky(float relativeAzimuth, float elevation) {
  float cacheU = clamp(abs(relativeAzimuth) / PI, 0.0, 1.0);
  float signedElevation = sign(elevation) * sqrt(abs(elevation) / (PI * 0.5));
  float cacheV = clamp(signedElevation * 0.5 + 0.5, 0.0, 1.0);
  vec2 position = vec2(
    cacheU * max(uCacheResolution - 1.0, 1.0),
    cacheV * uCacheResolution - 0.5
  );
  ivec2 lower = ivec2(floor(position));
  ivec2 upper = lower + 1;
  lower = clamp(lower, ivec2(0), ivec2(int(uCacheResolution) - 1));
  upper = clamp(upper, ivec2(0), ivec2(int(uCacheResolution) - 1));
  vec2 fraction = fract(position);
  vec3 bottom = mix(
    texelFetch(uSkyTexture, ivec2(lower.x, lower.y), 0).rgb,
    texelFetch(uSkyTexture, ivec2(upper.x, lower.y), 0).rgb,
    fraction.x
  );
  vec3 top = mix(
    texelFetch(uSkyTexture, ivec2(lower.x, upper.y), 0).rgb,
    texelFetch(uSkyTexture, ivec2(upper.x, upper.y), 0).rgb,
    fraction.x
  );
  return mix(bottom, top, fraction.y);
}

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

float apparentElevation(float trueElevationRadians) {
  float elevationDegrees = degrees(trueElevationRadians);
  return trueElevationRadians + radians(refractionCorrection(elevationDegrees) * uRefraction);
}

vec3 xyzToLinearSrgb(vec3 xyz) {
  return max(vec3(
    3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z,
    -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z,
    0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z
  ), 0.0);
}

vec3 acesToneMap(vec3 color) {
  return clamp(
    (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14),
    0.0,
    1.0
  );
}

vec3 linearToSrgb(vec3 color) {
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(max(color, 0.0), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), color));
}

float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 screen = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;
  float aspect = uResolution.x / uResolution.y;
  float verticalField = radians(uFieldOfView);
  float tangentHalfField = tan(verticalField * 0.5);
  float horizontalField = 2.0 * atan(aspect * tangentHalfField);
  float trueSunElevation = radians(uSunElevation);
  float halfSolarAngle = radians(0.266);
  float apparentSunTop = apparentElevation(trueSunElevation + halfSolarAngle);
  float apparentSunBottom = apparentElevation(trueSunElevation - halfSolarAngle);
  float apparentSunCenter = 0.5 * (apparentSunTop + apparentSunBottom);
  float apparentSunHalfHeight = max(0.5 * (apparentSunTop - apparentSunBottom), 1e-5);
  float tracking = smoothstep(radians(6.0), radians(16.0), apparentSunCenter);
  float cameraElevation = mix(radians(3.0), apparentSunCenter, tracking);
  float sunAzimuth = uSunX * horizontalField * 0.5 / max(cos(apparentSunCenter), 0.35);

  vec3 cameraForward = vec3(cos(cameraElevation), 0.0, sin(cameraElevation));
  vec3 cameraRight = vec3(0.0, 1.0, 0.0);
  vec3 cameraUp = vec3(-sin(cameraElevation), 0.0, cos(cameraElevation));
  vec3 rayDirection = normalize(
    cameraForward + screen.x * tangentHalfField * cameraRight + screen.y * tangentHalfField * cameraUp
  );
  float viewAzimuth = atan(rayDirection.y, rayDirection.x);
  float viewElevation = asin(clamp(rayDirection.z, -1.0, 1.0));

  float earthDip = acos(clamp(EARTH_RADIUS / (EARTH_RADIUS + uObserverAltitude), 0.0, 1.0));
  float horizon = radians(uHorizonElevation) - earthDip;
  float horizonProximity = exp(-abs(viewElevation - horizon) * 9.0);
  float seeingPhase = uTime * uSeeingSpeed * 0.6;
  vec2 seeing = vec2(
    sin(viewElevation * 173.0 + seeingPhase) + 0.47 * sin(viewAzimuth * 119.0 - seeingPhase * 1.7),
    cos(viewAzimuth * 137.0 - seeingPhase * 1.2) + 0.43 * cos(viewElevation * 211.0 + seeingPhase * 1.9)
  );
  seeing *= radians(uSeeingAmount / 60.0) * 0.34 * horizonProximity;
  viewAzimuth += seeing.x;
  viewElevation += seeing.y;
  rayDirection = vec3(
    cos(viewElevation) * cos(viewAzimuth),
    cos(viewElevation) * sin(viewAzimuth),
    sin(viewElevation)
  );

  float relativeAzimuth = viewAzimuth - sunAzimuth;
  vec3 skyRadiance = xyzToLinearSrgb(sampleSky(relativeAzimuth, viewElevation));
  vec3 apparentSunDirection = vec3(
    cos(apparentSunCenter) * cos(sunAzimuth),
    cos(apparentSunCenter) * sin(sunAzimuth),
    sin(apparentSunCenter)
  );
  vec3 sunRight = vec3(-sin(sunAzimuth), cos(sunAzimuth), 0.0);
  vec3 sunUp = cross(apparentSunDirection, sunRight);
  float rayAlongSun = dot(rayDirection, apparentSunDirection);
  vec2 angularOffset = vec2(
    atan(dot(rayDirection, sunRight), rayAlongSun),
    atan(dot(rayDirection, sunUp), rayAlongSun)
  );
  float angularDistance = length(angularOffset);
  skyRadiance *= 1.0 + uAureole * 0.32 * exp(-angularDistance * 24.0);

  float horizontalDiskRadius = halfSolarAngle * uSunScale;
  float verticalDiskRadius = apparentSunHalfHeight * uSunScale;
  vec2 diskPosition = vec2(
    angularOffset.x / horizontalDiskRadius,
    angularOffset.y / verticalDiskRadius
  );
  float diskRadiusSquared = dot(diskPosition, diskPosition);
  float horizonPixel = verticalField / max(uResolution.y, 1.0) * 1.5;
  float horizonMask = smoothstep(-horizonPixel, horizonPixel, viewElevation - horizon);

  if (diskRadiusSquared < 1.0 && horizonMask > 0.0) {
    float trueSampleElevation = trueSunElevation + diskPosition.y * halfSolarAngle;
    float tangentSafeElevation = trueSampleElevation >= 0.0
      ? trueSampleElevation
      : max(viewElevation, radians(0.05));
    vec4 directTransmittance = sampleTransmittance(
      sin(tangentSafeElevation),
      uObserverAltitude / ATMOSPHERE_THICKNESS
    );
    float solidAngle = 2.0 * PI * (1.0 - cos(halfSolarAngle));
    float limbCosine = sqrt(max(1.0 - diskRadiusSquared, 0.0));
    float limbDarkening = 0.52 + 0.48 * limbCosine;
    vec3 directSun = xyzToLinearSrgb(
      spectralToXyz(SUN_SPECTRAL_IRRADIANCE * directTransmittance / solidAngle)
    );
    skyRadiance += directSun * limbDarkening * horizonMask;
  }

  vec3 groundRadiance = vec3(0.0045, 0.0032, 0.0024) * (0.3 + uGroundAlbedo) +
    skyRadiance * 0.018;
  vec3 sceneRadiance = mix(groundRadiance, skyRadiance, horizonMask);
  float solarDepression = max(-uSunElevation - 0.5, 0.0);
  float twilightAdaptation = exp2(
    min(solarDepression, 6.5) * 0.58 - max(solarDepression - 6.5, 0.0) * 0.32
  );
  vec3 displayColor = linearToSrgb(
    acesToneMap(sceneRadiance * uExposure * 0.22 * twilightAdaptation)
  );
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(clamp(displayColor + dither, 0.0, 1.0), 1.0);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Solar Sky shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Solar Sky shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext, fragmentSource: string): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  let fragmentShader: WebGLShader | null = null
  let program: WebGLProgram | null = null
  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    program = gl.createProgram()
    if (!program) throw new Error('Unable to create Solar Sky shader program')
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Unknown Solar Sky shader link error')
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

function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height = width,
): RenderTarget {
  const texture = gl.createTexture()
  const framebuffer = gl.createFramebuffer()
  if (!texture || !framebuffer) {
    if (texture) gl.deleteTexture(texture)
    if (framebuffer) gl.deleteFramebuffer(framebuffer)
    throw new Error('Unable to create Solar Sky render target')
  }

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer)
    gl.deleteTexture(texture)
    throw new Error('Solar Sky float render target is incomplete')
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return { framebuffer, size: width, texture }
}

function createResources(gl: WebGL2RenderingContext): SolarSkyResources {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Solar Sky requires EXT_color_buffer_float')
  }
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Solar Sky vertex array')
  let transmittance: RenderTarget | null = null
  let lowSky: RenderTarget | null = null
  let highSky: RenderTarget | null = null
  let transmittanceProgram: WebGLProgram | null = null
  let skyProgram: WebGLProgram | null = null
  let finalProgram: WebGLProgram | null = null
  try {
    transmittance = createRenderTarget(gl, TRANSMITTANCE_WIDTH, TRANSMITTANCE_HEIGHT)
    lowSky = createRenderTarget(gl, LOW_SKY_SIZE)
    highSky = createRenderTarget(gl, HIGH_SKY_SIZE)
    transmittanceProgram = createProgram(gl, TRANSMITTANCE_FRAGMENT_SHADER)
    skyProgram = createProgram(gl, SKY_FRAGMENT_SHADER)
    finalProgram = createProgram(gl, FINAL_FRAGMENT_SHADER)
    gl.bindVertexArray(vertexArray)
    return {
      finalProgram,
      highSky,
      lowSky,
      skyProgram,
      transmittance,
      transmittanceProgram,
      vertexArray,
    }
  } catch (error) {
    if (transmittance) deleteRenderTarget(gl, transmittance)
    if (lowSky) deleteRenderTarget(gl, lowSky)
    if (highSky) deleteRenderTarget(gl, highSky)
    if (transmittanceProgram) gl.deleteProgram(transmittanceProgram)
    if (skyProgram) gl.deleteProgram(skyProgram)
    if (finalProgram) gl.deleteProgram(finalProgram)
    gl.deleteVertexArray(vertexArray)
    throw error
  }
}

function deleteRenderTarget(gl: WebGL2RenderingContext, target: RenderTarget): void {
  gl.deleteFramebuffer(target.framebuffer)
  gl.deleteTexture(target.texture)
}

function deleteResources(gl: WebGL2RenderingContext, resources: SolarSkyResources): void {
  deleteRenderTarget(gl, resources.transmittance)
  deleteRenderTarget(gl, resources.lowSky)
  deleteRenderTarget(gl, resources.highSky)
  gl.deleteProgram(resources.transmittanceProgram)
  gl.deleteProgram(resources.skyProgram)
  gl.deleteProgram(resources.finalProgram)
  gl.deleteVertexArray(resources.vertexArray)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function sanitizedSettings(settings: SolarSkySettings): SolarSkySettings {
  return {
    airDensity: clamp(settings.airDensity, 0, 3),
    aerosolAbsorption: clamp(settings.aerosolAbsorption, 0, 4),
    aerosolAnisotropy: clamp(settings.aerosolAnisotropy, 0, 0.95),
    aerosolDensity: clamp(settings.aerosolDensity, 0, 5),
    aureole: clamp(settings.aureole, 0, 3),
    exposure: clamp(settings.exposure, 0, 4),
    fieldOfView: clamp(settings.fieldOfView, 8, 80),
    groundAlbedo: clamp(settings.groundAlbedo, 0, 1),
    horizonElevation: clamp(settings.horizonElevation, -5, 15),
    observerAltitude: clamp(settings.observerAltitude, 1, 99999) / 1000,
    ozoneDensity: clamp(settings.ozoneDensity, 0, 3),
    refraction: clamp(settings.refraction, 0, 1.5),
    seeingAmount: clamp(settings.seeingAmount, 0, 6),
    seeingSpeed: clamp(settings.seeingSpeed, 0, 3),
    sunElevation: clamp(settings.sunElevation, -18, 90),
    sunScale: clamp(settings.sunScale, 1, 20),
    sunX: clamp(settings.sunX, -0.9, 0.9),
  }
}

function uniform1f(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  value: number,
): void {
  const location = gl.getUniformLocation(program, name)
  if (location !== null) gl.uniform1f(location, value)
}

function setAtmosphereUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  settings: SolarSkySettings,
): void {
  uniform1f(gl, program, 'uAirDensity', settings.airDensity)
  uniform1f(gl, program, 'uAerosolAbsorption', settings.aerosolAbsorption)
  uniform1f(gl, program, 'uAerosolAnisotropy', settings.aerosolAnisotropy)
  uniform1f(gl, program, 'uAerosolDensity', settings.aerosolDensity)
  uniform1f(gl, program, 'uGroundAlbedo', settings.groundAlbedo)
  uniform1f(gl, program, 'uOzoneDensity', settings.ozoneDensity)
}

function drawTransmittance(
  gl: WebGL2RenderingContext,
  resources: SolarSkyResources,
  settings: SolarSkySettings,
  startRow: number,
  rowCount: number,
): void {
  const { transmittance, transmittanceProgram } = resources
  gl.bindFramebuffer(gl.FRAMEBUFFER, transmittance.framebuffer)
  gl.viewport(0, 0, TRANSMITTANCE_WIDTH, TRANSMITTANCE_HEIGHT)
  gl.enable(gl.SCISSOR_TEST)
  gl.scissor(0, startRow, TRANSMITTANCE_WIDTH, rowCount)
  gl.useProgram(transmittanceProgram)
  setAtmosphereUniforms(gl, transmittanceProgram, settings)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.disable(gl.SCISSOR_TEST)
}

function drawSky(
  gl: WebGL2RenderingContext,
  resources: SolarSkyResources,
  target: RenderTarget,
  settings: SolarSkySettings,
  startRow: number,
  rowCount: number,
): void {
  const { skyProgram, transmittance } = resources
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
  gl.viewport(0, 0, target.size, target.size)
  gl.enable(gl.SCISSOR_TEST)
  gl.scissor(0, startRow, target.size, rowCount)
  gl.useProgram(skyProgram)
  setAtmosphereUniforms(gl, skyProgram, settings)
  uniform1f(gl, skyProgram, 'uObserverAltitude', settings.observerAltitude)
  uniform1f(gl, skyProgram, 'uSkyResolution', target.size)
  uniform1f(gl, skyProgram, 'uSunElevation', (settings.sunElevation * Math.PI) / 180)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, transmittance.texture)
  const textureLocation = gl.getUniformLocation(skyProgram, 'uTransmittanceTexture')
  if (textureLocation !== null) gl.uniform1i(textureLocation, 0)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.disable(gl.SCISSOR_TEST)
}

function atmosphereKey(settings: SolarSkySettings): string {
  return [
    settings.airDensity,
    settings.aerosolAbsorption,
    settings.aerosolDensity,
    settings.ozoneDensity,
  ].join('|')
}

function skyKey(settings: SolarSkySettings): string {
  return [
    atmosphereKey(settings),
    settings.aerosolAnisotropy,
    settings.groundAlbedo,
    settings.observerAltitude,
    settings.sunElevation,
  ].join('|')
}

function createSolarSkyRenderer(
  canvas: HTMLCanvasElement,
  _input: null,
): CanvasRenderer<SolarSkySettings> | null {
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
  let displaySky: RenderTarget | null = null
  let disposed = false
  let highSkyRows = 0
  let lastAtmosphereKey = ''
  let lastSkyKey = ''
  let lowSkyRows = 0
  let resources: SolarSkyResources | null = createResources(gl)
  let settleAt = 0
  let startTime = performance.now()
  let transmittanceReady = false
  let transmittanceRows = 0

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

  function render(timestamp: number, frameSettings: SolarSkySettings): void {
    if (disposed || contextLost || !resources) return
    const settings = sanitizedSettings(frameSettings)
    const activeResources = resources
    const nextAtmosphereKey = atmosphereKey(settings)
    const nextSkyKey = skyKey(settings)

    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.bindVertexArray(activeResources.vertexArray)

    if (nextAtmosphereKey !== lastAtmosphereKey) {
      lastAtmosphereKey = nextAtmosphereKey
      transmittanceReady = false
      transmittanceRows = 0
    }
    if (nextSkyKey !== lastSkyKey) {
      lastSkyKey = nextSkyKey
      lowSkyRows = 0
      highSkyRows = 0
      settleAt = Number.POSITIVE_INFINITY
    }

    if (!transmittanceReady) {
      const rowCount = Math.min(8, TRANSMITTANCE_HEIGHT - transmittanceRows)
      drawTransmittance(gl, activeResources, settings, transmittanceRows, rowCount)
      transmittanceRows += rowCount
      transmittanceReady = transmittanceRows === TRANSMITTANCE_HEIGHT
    } else if (lowSkyRows < LOW_SKY_SIZE) {
      const rowCount = Math.min(4, LOW_SKY_SIZE - lowSkyRows)
      drawSky(gl, activeResources, activeResources.lowSky, settings, lowSkyRows, rowCount)
      lowSkyRows += rowCount
      if (lowSkyRows === LOW_SKY_SIZE) {
        displaySky = activeResources.lowSky
        settleAt = timestamp + SETTLE_DELAY_MS
      }
    } else if (timestamp >= settleAt && highSkyRows < HIGH_SKY_SIZE) {
      const rowCount = Math.min(4, HIGH_SKY_SIZE - highSkyRows)
      drawSky(gl, activeResources, activeResources.highSky, settings, highSkyRows, rowCount)
      highSkyRows += rowCount
      if (highSkyRows === HIGH_SKY_SIZE) displaySky = activeResources.highSky
    }

    const sky = displaySky
    if (!sky) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindVertexArray(null)
      return
    }
    const program = activeResources.finalProgram
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(program)
    setAtmosphereUniforms(gl, program, settings)
    uniform1f(gl, program, 'uAureole', settings.aureole)
    uniform1f(gl, program, 'uCacheResolution', sky.size)
    uniform1f(gl, program, 'uExposure', settings.exposure)
    uniform1f(gl, program, 'uFieldOfView', settings.fieldOfView)
    uniform1f(gl, program, 'uHorizonElevation', settings.horizonElevation)
    uniform1f(gl, program, 'uObserverAltitude', settings.observerAltitude)
    uniform1f(gl, program, 'uRefraction', settings.refraction)
    const resolutionLocation = gl.getUniformLocation(program, 'uResolution')
    if (resolutionLocation !== null) {
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    }
    uniform1f(gl, program, 'uSeeingAmount', settings.seeingAmount)
    uniform1f(gl, program, 'uSeeingSpeed', settings.seeingSpeed)
    uniform1f(gl, program, 'uSunElevation', settings.sunElevation)
    uniform1f(gl, program, 'uSunScale', settings.sunScale)
    uniform1f(gl, program, 'uSunX', settings.sunX)
    uniform1f(gl, program, 'uTime', (timestamp - startTime) / 1000)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sky.texture)
    const skyLocation = gl.getUniformLocation(program, 'uSkyTexture')
    if (skyLocation !== null) gl.uniform1i(skyLocation, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, activeResources.transmittance.texture)
    const transmittanceLocation = gl.getUniformLocation(program, 'uTransmittanceTexture')
    if (transmittanceLocation !== null) gl.uniform1i(transmittanceLocation, 1)
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
    displaySky = null
    highSkyRows = 0
    lastAtmosphereKey = ''
    lastSkyKey = ''
    lowSkyRows = 0
    settleAt = 0
    startTime = performance.now()
    transmittanceReady = false
    transmittanceRows = 0
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

export function SolarSkyEffect({
  airDensity = 1,
  aerosolAbsorption = 1,
  aerosolAnisotropy = 0.8,
  aerosolDensity = 1.1,
  aureole = 1,
  className,
  exposure = 0.2,
  fieldOfView = 38,
  groundAlbedo = 0.25,
  horizonElevation = 0,
  observerAltitude = 20,
  ozoneDensity = 1,
  refraction = 1,
  seeingAmount = 0.65,
  seeingSpeed = 1,
  sunElevation = 0.8,
  sunScale = 4.8,
  sunX = 0.18,
  style,
}: SolarSkyEffectProps) {
  const frameSettings: SolarSkySettings = {
    airDensity,
    aerosolAbsorption,
    aerosolAnisotropy,
    aerosolDensity,
    aureole,
    exposure,
    fieldOfView,
    groundAlbedo,
    horizonElevation,
    observerAltitude,
    ozoneDensity,
    refraction,
    seeingAmount,
    seeingSpeed,
    sunElevation,
    sunScale,
    sunX,
  }
  const canvasRef = useCanvasRenderer(frameSettings, SOLAR_SKY_INPUT, createSolarSkyRenderer)

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', width: '100%', ...style }}
    />
  )
}
