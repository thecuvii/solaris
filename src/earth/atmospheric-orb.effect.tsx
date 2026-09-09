// Hosted textures:
// https://solaris.cuvii.dev/textures/v1/earth/earth-cloud.webp
// https://solaris.cuvii.dev/textures/v1/earth/earth-day.webp
// https://solaris.cuvii.dev/textures/v1/earth/earth-material.webp
// https://solaris.cuvii.dev/textures/v1/earth/earth-night.webp
// https://solaris.cuvii.dev/textures/v1/earth/earth-normal.webp
// https://solaris.cuvii.dev/textures/v1/earth/earth-roughness.webp
// Original textures:
// https://www.solarsystemscope.com/textures/

'use client'

import { OrbCanvas } from '../internal/orb-canvas'
import type { OrbRendererSpec, OrbSource } from '../internal/orb-renderer'
import { createUniformResolver, type UniformResolver } from '../internal/uniforms'
import {
  createProgram,
  createRenderTarget,
  createTexture,
  deleteRenderTarget,
  type RenderTarget,
  resizeRenderTarget,
  uploadImage,
  withUnpackState,
} from '../internal/webgl'
import type { OrbCanvasProps, OrbLightingProps, OrbPoseProps } from '../orb'

export type AtmosphericOrbColor = readonly [red: number, green: number, blue: number]

export type AtmosphericOrbModel = {
  mieExtinction: AtmosphericOrbColor
  mieScattering: AtmosphericOrbColor
  ozoneAbsorption: AtmosphericOrbColor
  rayleighScattering: AtmosphericOrbColor
  space: AtmosphericOrbColor
  surfaceDay: AtmosphericOrbColor
  surfaceNight: AtmosphericOrbColor
  sun: AtmosphericOrbColor
  sunIntensity: number
}

/** Scattering coefficients and palette; see {@link defaultEarthModel}. */
export const defaultEarthModel: AtmosphericOrbModel = {
  mieExtinction: [8, 8, 8],
  mieScattering: [5.4, 5.1, 4.8],
  ozoneAbsorption: [0.65, 1.88, 0.08],
  rayleighScattering: [3.2, 7.6, 18.5],
  space: [0, 0, 0.002],
  surfaceDay: [0.035, 0.22, 0.3],
  surfaceNight: [0.002, 0.006, 0.018],
  sun: [1, 0.91, 0.72],
  sunIntensity: 18,
}

export type AtmosphericSurface = {
  /**
   * Equirectangular cloud coverage in the red channel. Enables the Earth
   * pipeline: cloud shadows, city-light bloom and ocean waves.
   */
  cloud?: TexImageSource
  /** Equirectangular sRGB daytime albedo. */
  day: TexImageSource
  longitudeOffsetDegrees?: number
  /** Ocean mask in the red channel. Without it water is derived from roughness. */
  material?: TexImageSource
  /** Equirectangular sRGB night-side emission (city lights). */
  night: TexImageSource
  /** Tangent-space normal map. */
  normal: TexImageSource
  /** Surface roughness in the red channel. */
  roughness: TexImageSource
}

export type AtmosphericOrbSource = OrbSource<AtmosphericSurface>

export type AtmosphericOrbEffectProps = OrbCanvasProps &
  OrbPoseProps &
  OrbLightingProps & {
    /** Mie aerosol load; scales haze scattering and extinction. Range 0–3. @default 1 */
    aerosol?: number
    /** Atmosphere shell thickness in planet radii. Range 0.05–0.4. @default 0.16 */
    atmosphereThickness?: number
    /** Night-side city light brightness. Range 0–3. @default 1 */
    cityLights?: number
    /** Cloud coverage multiplier. Range 0–2. @default 1 */
    cloudDensity?: number
    /** Cloud shell altitude as a percentage of the planet radius. Range 0.2–4. @default 1.2 */
    cloudHeight?: number
    /** Surface darkening under cloud shadows. Range 0–1. @default 0.48 */
    cloudShadowIntensity?: number
    /** Overall atmosphere density multiplier. Range 0–3. @default 1 */
    density?: number
    /** Scattering coefficients and colour palette. @default defaultEarthModel */
    model?: AtmosphericOrbModel
    /** Multiple-scattering contribution. Range 0–2. @default 1 */
    multipleScattering?: number
    /** Sun glitter on water. Range 0–2. @default 0.72 */
    oceanGlint?: number
    /** Wave normal perturbation on water. Range 0–2. @default 0.8 */
    oceanWaveStrength?: number
    /** Surface textures. Without a source a procedural sphere is rendered. */
    source?: AtmosphericOrbSource
    /**
     * Sun azimuth drift in degrees per second. 0 stops the orbit and aims the
     * sun at the pointer instead.
     * @default 4.6
     */
    sunOrbit?: number
  }

type AtmosphericFrameSettings = {
  aerosol: number
  atmosphereThickness: number
  cityLights: number
  cloudDensity: number
  cloudHeight: number
  cloudShadowIntensity: number
  density: number
  lean: boolean
  model: AtmosphericOrbModel
  multipleScattering: number
  oceanGlint: number
  oceanWaveStrength: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  sunOrbit: number
  tilt: number
  yaw: number
}

const PLANET_RADIUS = 0.82

const TRANSMITTANCE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;

uniform float uAerosol;
uniform float uDensity;
uniform float uAtmosphereRadius;
uniform vec3 uMieExtinction;
uniform vec3 uOzoneAbsorption;
uniform float uPlanetRadius;
uniform vec3 uRayleighScattering;

out vec4 fragColor;

const int TRANSMITTANCE_STEPS = 32;

vec2 raySphereIntersect(vec3 rayOrigin, vec3 rayDirection, float radius) {
  float b = dot(rayOrigin, rayDirection);
  float c = dot(rayOrigin, rayOrigin) - radius * radius;
  float discriminant = b * b - c;
  if (discriminant < 0.0) return vec2(-1.0);
  float root = sqrt(discriminant);
  return vec2(-b - root, -b + root);
}

vec3 atmosphereDensity(float height, float thickness) {
  float rayleigh = exp(-max(height, 0.0) / max(thickness * 0.24, 0.0001));
  float mie = exp(-max(height, 0.0) / max(thickness * 0.075, 0.0001));
  float ozoneCenter = thickness * 0.46;
  float ozoneWidth = max(thickness * 0.18, 0.0001);
  float ozone = exp(-pow((height - ozoneCenter) / ozoneWidth, 2.0));
  return vec3(rayleigh, mie, ozone) * uDensity;
}

void main() {
  float thickness = uAtmosphereRadius - uPlanetRadius;
  float radius = mix(uPlanetRadius + 0.0002, uAtmosphereRadius - 0.0002, vUv.y);
  float mu = mix(-1.0, 1.0, vUv.x);
  vec3 rayOrigin = vec3(0.0, radius, 0.0);
  vec3 rayDirection = normalize(vec3(sqrt(max(1.0 - mu * mu, 0.0)), mu, 0.0));
  vec2 atmosphereHit = raySphereIntersect(rayOrigin, rayDirection, uAtmosphereRadius);
  vec2 planetHit = raySphereIntersect(rayOrigin, rayDirection, uPlanetRadius);

  if (planetHit.y > 0.001) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float rayLength = max(atmosphereHit.y, 0.0);
  float stepSize = rayLength / float(TRANSMITTANCE_STEPS);
  vec3 opticalDepth = vec3(0.0);

  for (int index = 0; index < TRANSMITTANCE_STEPS; index++) {
    float distanceAlongRay = (float(index) + 0.5) * stepSize;
    vec3 samplePoint = rayOrigin + rayDirection * distanceAlongRay;
    float height = length(samplePoint) - uPlanetRadius;
    opticalDepth += atmosphereDensity(height, thickness) * stepSize;
  }

  vec3 extinction =
    uRayleighScattering * opticalDepth.x +
    uMieExtinction * opticalDepth.y * uAerosol +
    uOzoneAbsorption * opticalDepth.z;
  fragColor = vec4(exp(-extinction), 1.0);
}
`

const MULTIPLE_SCATTERING_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

uniform float uAerosol;
uniform float uDensity;
uniform float uAtmosphereRadius;
uniform vec3 uMieExtinction;
uniform vec3 uMieScattering;
uniform vec3 uOzoneAbsorption;
uniform float uPlanetRadius;
uniform vec3 uRayleighScattering;
uniform sampler2D uTransmittance;

out vec4 fragColor;

const int SPHERE_SAMPLES = 12;

vec3 atmosphereDensity(float height, float thickness) {
  float rayleigh = exp(-max(height, 0.0) / max(thickness * 0.24, 0.0001));
  float mie = exp(-max(height, 0.0) / max(thickness * 0.075, 0.0001));
  float ozoneCenter = thickness * 0.46;
  float ozoneWidth = max(thickness * 0.18, 0.0001);
  float ozone = exp(-pow((height - ozoneCenter) / ozoneWidth, 2.0));
  return vec3(rayleigh, mie, ozone) * uDensity;
}

void main() {
  float thickness = uAtmosphereRadius - uPlanetRadius;
  float height = mix(0.0002, thickness - 0.0002, vUv.y);
  float sunZenith = mix(-1.0, 1.0, vUv.x);
  vec3 density = atmosphereDensity(height, thickness);
  vec3 scattering =
    uRayleighScattering * density.x + uMieScattering * density.y * uAerosol;
  vec3 extinction =
    uRayleighScattering * density.x +
    uMieExtinction * density.y * uAerosol +
    uOzoneAbsorption * density.z;
  vec3 singleScatteringAlbedo = clamp(scattering / max(extinction, vec3(0.0001)), 0.0, 0.995);
  vec3 averageInteraction = vec3(0.0);

  for (int index = 0; index < SPHERE_SAMPLES; index++) {
    float sampleIndex = float(index) + 0.5;
    float directionZenith = 1.0 - 2.0 * sampleIndex / float(SPHERE_SAMPLES);
    vec3 escape = texture(
      uTransmittance,
      vec2(directionZenith * 0.5 + 0.5, height / thickness)
    ).rgb;
    averageInteraction += 1.0 - escape;
  }
  averageInteraction /= float(SPHERE_SAMPLES);

  vec3 sunTransmittance = texture(
    uTransmittance,
    vec2(sunZenith * 0.5 + 0.5, height / thickness)
  ).rgb;
  vec3 feedback = clamp(singleScatteringAlbedo * averageInteraction * 0.72, 0.0, 0.88);
  vec3 localSource =
    sunTransmittance * scattering * thickness * (0.035 + 0.12 * density.x);
  vec3 multipleScattering = localSource * feedback / max(vec3(1.0) - feedback, vec3(0.08));
  fragColor = vec4(multipleScattering, 1.0);
}
`

const ATMOSPHERE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

uniform float uAerosol;
uniform vec2 uCompositionCenter;
uniform float uCompositionScale;
uniform float uDensity;
uniform vec2 uResolution;
uniform float uAtmosphereRadius;
uniform float uCloudDensity;
uniform float uCloudHeight;
uniform float uCloudShadowIntensity;
uniform sampler2D uCloudTexture;
uniform sampler2D uDayTexture;
uniform float uEarthPipeline;
uniform float uHasMaterialSource;
uniform float uHasSurfaceSource;
uniform float uLongitudeOffset;
uniform sampler2D uMaterialTexture;
uniform vec3 uMieExtinction;
uniform vec3 uMieScattering;
uniform float uMultipleScattering;
uniform sampler2D uMultipleScatteringTexture;
uniform float uNightLightIntensity;
uniform sampler2D uNightTexture;
uniform sampler2D uNormalTexture;
uniform float uOceanGlint;
uniform float uOceanWaveStrength;
uniform vec3 uOzoneAbsorption;
uniform float uPlanetRadius;
uniform vec3 uRayleighScattering;
uniform float uSpin;
uniform sampler2D uRoughnessTexture;
uniform vec3 uSpaceColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uSunIntensity;
uniform vec3 uSurfaceDay;
uniform vec3 uSurfaceNight;
uniform float uTilt;
uniform sampler2D uTransmittance;
uniform float uTime;
uniform float uYaw;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 emissionColor;

const float PI = 3.141592653589793;
const int PRIMARY_STEPS = 24;
const float CLOUD_SPIN_RATIO = 0.0215 / 0.024;

vec2 raySphereIntersect(vec3 rayOrigin, vec3 rayDirection, float radius) {
  float b = dot(rayOrigin, rayDirection);
  float c = dot(rayOrigin, rayOrigin) - radius * radius;
  float discriminant = b * b - c;
  if (discriminant < 0.0) return vec2(-1.0);
  float root = sqrt(discriminant);
  return vec2(-b - root, -b + root);
}

float hash(vec3 value) {
  value = fract(value * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

float valueNoise(vec3 value) {
  vec3 cell = floor(value);
  vec3 fraction = fract(value);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(
    mix(
      mix(hash(cell), hash(cell + vec3(1.0, 0.0, 0.0)), fraction.x),
      mix(hash(cell + vec3(0.0, 1.0, 0.0)), hash(cell + vec3(1.0, 1.0, 0.0)), fraction.x),
      fraction.y
    ),
    mix(
      mix(hash(cell + vec3(0.0, 0.0, 1.0)), hash(cell + vec3(1.0, 0.0, 1.0)), fraction.x),
      mix(hash(cell + vec3(0.0, 1.0, 1.0)), hash(cell + vec3(1.0)), fraction.x),
      fraction.y
    ),
    fraction.z
  );
}

vec3 rotateAroundY(vec3 value, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec3(
    cosine * value.x + sine * value.z,
    value.y,
    -sine * value.x + cosine * value.z
  );
}

vec3 rotateX(vec3 value, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec3(value.x, cosine * value.y - sine * value.z, sine * value.y + cosine * value.z);
}

vec3 bodyDirection(vec3 direction, float spinAngle) {
  return rotateAroundY(rotateX(direction, uTilt), spinAngle + uLongitudeOffset + uYaw);
}

vec2 sphereUv(vec3 normal) {
  float longitude = atan(normal.x, normal.z);
  float latitude = asin(clamp(normal.y, -1.0, 1.0));
  return vec2(fract(longitude / (2.0 * PI) + 0.5), latitude / PI + 0.5);
}

vec4 sampleEquirectangular(sampler2D source, vec3 normal) {
  vec2 uv = sphereUv(normal);
  vec2 uvDx = dFdx(uv);
  vec2 uvDy = dFdy(uv);
  uvDx.x -= round(uvDx.x);
  uvDy.x -= round(uvDy.x);
  return textureGrad(source, uv, uvDx, uvDy);
}

float cloudCoverage(vec3 normal) {
  float coverage = sampleEquirectangular(uCloudTexture, normal).r;
  return smoothstep(0.08, 0.82, coverage) * max(uCloudDensity, 0.0);
}

vec3 atmosphereDensity(float height, float thickness, vec3 samplePoint) {
  float rayleigh = exp(-max(height, 0.0) / max(thickness * 0.24, 0.0001));
  float mie = exp(-max(height, 0.0) / max(thickness * 0.075, 0.0001));
  float ozoneCenter = thickness * 0.46;
  float ozoneWidth = max(thickness * 0.18, 0.0001);
  float ozone = exp(-pow((height - ozoneCenter) / ozoneWidth, 2.0));
  float upperAir = smoothstep(0.08, 0.7, height / max(thickness, 0.0001));
  float shimmer = sin(dot(samplePoint, vec3(13.7, 19.1, 11.3)) + uTime * 0.17) * 0.5 + 0.5;
  rayleigh *= mix(1.0, 0.93 + shimmer * 0.14, upperAir);
  return vec3(rayleigh, mie, ozone) * uDensity;
}

vec3 sampleSunTransmittance(vec3 samplePoint) {
  float thickness = uAtmosphereRadius - uPlanetRadius;
  float height = clamp(length(samplePoint) - uPlanetRadius, 0.0, thickness);
  vec3 up = normalize(samplePoint);
  float mu = dot(up, uSunDirection);
  return texture(uTransmittance, vec2(mu * 0.5 + 0.5, height / thickness)).rgb;
}

vec3 sampleMultipleScattering(vec3 samplePoint) {
  float thickness = uAtmosphereRadius - uPlanetRadius;
  float height = clamp(length(samplePoint) - uPlanetRadius, 0.0, thickness);
  float mu = dot(normalize(samplePoint), uSunDirection);
  return texture(
    uMultipleScatteringTexture,
    vec2(mu * 0.5 + 0.5, height / thickness)
  ).rgb * uMultipleScattering;
}

vec2 oceanWaveSlope(vec2 uv) {
  float first = (uv.x * 96.0 + uv.y * 41.0) * 2.0 * PI + uTime * 0.72;
  float second = (uv.x * -157.0 + uv.y * 73.0) * 2.0 * PI - uTime * 0.51;
  float third = (uv.x * 53.0 + uv.y * 137.0) * 2.0 * PI + uTime * 0.34;
  vec2 slope =
    vec2(0.72, 0.31) * cos(first) +
    vec2(-0.46, 0.83) * cos(second) * 0.62 +
    vec2(0.28, -0.91) * cos(third) * 0.34;
  float footprint = max(fwidth(first), max(fwidth(second), fwidth(third)));
  return slope * (1.0 - smoothstep(0.85, 2.4, footprint));
}

float rayleighPhase(float cosineAngle) {
  return 3.0 / (16.0 * PI) * (1.0 + cosineAngle * cosineAngle);
}

float miePhase(float cosineAngle) {
  const float anisotropy = 0.76;
  float anisotropySquared = anisotropy * anisotropy;
  float numerator = 3.0 * (1.0 - anisotropySquared) * (1.0 + cosineAngle * cosineAngle);
  float denominator =
    8.0 * PI * (2.0 + anisotropySquared) *
    pow(max(1.0 + anisotropySquared - 2.0 * anisotropy * cosineAngle, 0.0001), 1.5);
  return numerator / denominator;
}

float distributionGgx(vec3 normal, vec3 halfDirection, float roughness) {
  float roughnessSquared = roughness * roughness;
  float alphaSquared = roughnessSquared * roughnessSquared;
  float normalHalf = max(dot(normal, halfDirection), 0.0);
  float denominator = normalHalf * normalHalf * (alphaSquared - 1.0) + 1.0;
  return alphaSquared / max(PI * denominator * denominator, 0.0001);
}

float geometrySchlickGgx(float normalDirection, float roughness) {
  float radius = roughness + 1.0;
  float factor = radius * radius / 8.0;
  return normalDirection / max(normalDirection * (1.0 - factor) + factor, 0.0001);
}

float geometrySmith(vec3 normal, vec3 viewDirection, vec3 lightDirection, float roughness) {
  float normalView = max(dot(normal, viewDirection), 0.0);
  float normalLight = max(dot(normal, lightDirection), 0.0);
  return geometrySchlickGgx(normalView, roughness) * geometrySchlickGgx(normalLight, roughness);
}

vec3 fresnelSchlick(float cosineAngle, vec3 reflectance) {
  return reflectance + (1.0 - reflectance) * pow(clamp(1.0 - cosineAngle, 0.0, 1.0), 5.0);
}

vec3 pbrDirectLight(
  vec3 albedo,
  vec3 normal,
  vec3 viewDirection,
  vec3 lightDirection,
  float roughness,
  vec3 reflectance
) {
  vec3 halfDirection = normalize(viewDirection + lightDirection);
  float normalView = max(dot(normal, viewDirection), 0.0);
  float normalLight = max(dot(normal, lightDirection), 0.0);
  float viewHalf = max(dot(viewDirection, halfDirection), 0.0);
  float distribution = distributionGgx(normal, halfDirection, roughness);
  float geometry = geometrySmith(normal, viewDirection, lightDirection, roughness);
  vec3 fresnel = fresnelSchlick(viewHalf, reflectance);
  vec3 specular = distribution * geometry * fresnel /
    max(4.0 * normalView * normalLight, 0.0001);
  vec3 diffuse = (1.0 - fresnel) * albedo / PI;
  return (diffuse + specular) * uSunColor * 2.55 * normalLight;
}

vec3 oceanSunGlitter(
  vec3 normal,
  vec3 viewDirection,
  vec3 lightDirection,
  float waterMask,
  vec3 rotatedNormal
) {
  vec3 halfDirection = normalize(viewDirection + lightDirection);
  float normalLight = max(dot(normal, lightDirection), 0.0);
  float normalView = max(dot(normal, viewDirection), 0.0);
  float distribution = distributionGgx(normal, halfDirection, 0.075);
  float geometry = geometrySmith(normal, viewDirection, lightDirection, 0.075);
  vec3 fresnel = fresnelSchlick(max(dot(viewDirection, halfDirection), 0.0), vec3(0.021));
  float microSparkle = mix(
    0.72,
    1.28,
    valueNoise(rotatedNormal * 420.0 + vec3(uTime * 0.08, 0.0, 0.0))
  );
  return
    uSunColor * distribution * geometry * fresnel * normalLight * microSparkle *
    waterMask * uOceanGlint / max(4.0 * normalView * normalLight, 0.0001);
}

vec3 filmic(vec3 color) {
  color = max(color, 0.0);
  return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 screen = (vUv * uResolution - uCompositionCenter) * 2.0 / uCompositionScale;
  vec3 rayOrigin = vec3(0.0, 0.0, 3.0);
  vec3 rayDirection = normalize(vec3(screen * 0.39, -1.0));
  vec2 atmosphereHit = raySphereIntersect(rayOrigin, rayDirection, uAtmosphereRadius);

  if (atmosphereHit.y <= 0.0) {
    fragColor = vec4(0.0);
    emissionColor = vec4(0.0);
    return;
  }

  vec2 planetHit = raySphereIntersect(rayOrigin, rayDirection, uPlanetRadius);
  float atmosphereNear = max(atmosphereHit.x, 0.0);
  float atmosphereFar = atmosphereHit.y;
  bool hitsSurface = planetHit.x > 0.0;
  if (hitsSurface) atmosphereFar = min(atmosphereFar, planetHit.x);

  float segmentLength = max(atmosphereFar - atmosphereNear, 0.0);
  float stepSize = segmentLength / float(PRIMARY_STEPS);
  vec3 viewOpticalDepth = vec3(0.0);
  vec3 sumRayleigh = vec3(0.0);
  vec3 sumMie = vec3(0.0);
  vec3 sumMultipleScattering = vec3(0.0);
  float viewSunCosine = dot(rayDirection, uSunDirection);
  float thickness = uAtmosphereRadius - uPlanetRadius;

  for (int index = 0; index < PRIMARY_STEPS; index++) {
    float distanceAlongRay = atmosphereNear + (float(index) + 0.5) * stepSize;
    vec3 samplePoint = rayOrigin + rayDirection * distanceAlongRay;
    float height = length(samplePoint) - uPlanetRadius;
    vec3 density = atmosphereDensity(height, thickness, samplePoint);
    viewOpticalDepth += density * stepSize;
    vec3 viewExtinction =
      uRayleighScattering * viewOpticalDepth.x +
      uMieExtinction * viewOpticalDepth.y * uAerosol +
      uOzoneAbsorption * viewOpticalDepth.z;
    vec3 transmittance = exp(-viewExtinction) * sampleSunTransmittance(samplePoint);
    sumRayleigh += density.x * transmittance * stepSize;
    sumMie += density.y * transmittance * stepSize;
    sumMultipleScattering +=
      sampleMultipleScattering(samplePoint) * exp(-viewExtinction) *
      (density.x + density.y * uAerosol) * stepSize;
  }

  vec3 rayleighAtmosphere =
    uSunColor * uSunIntensity *
    uRayleighScattering * sumRayleigh * rayleighPhase(viewSunCosine);
  vec3 mieAtmosphere =
    uSunColor * uSunIntensity *
    uMieScattering * sumMie * uAerosol * miePhase(viewSunCosine);
  vec3 multipleScatteringAtmosphere =
    uSunColor * uSunIntensity * sumMultipleScattering * 0.68;
  float closestApproach = length(cross(rayOrigin, rayDirection));
  float grazingAltitude = clamp(
    (closestApproach - uPlanetRadius) / max(thickness, 0.0001),
    0.0,
    1.0
  );
  vec3 atmosphere = rayleighAtmosphere + mieAtmosphere + multipleScatteringAtmosphere;

  vec3 color = uSpaceColor;
  float alpha = 0.0;
  float opticalPresence = 1.0 - exp(-viewOpticalDepth.x * 9.0 - viewOpticalDepth.y * 18.0);
  float atmosphereAlpha = clamp(
    opticalPresence * (0.28 + dot(atmosphere, vec3(0.28, 0.56, 0.16)) * 2.2),
    0.0,
    1.0
  );
  atmosphereAlpha *= 1.0 - smoothstep(
    uEarthPipeline > 0.5 ? 0.52 : 0.35,
    uEarthPipeline > 0.5 ? 1.0 : 0.88,
    grazingAltitude
  );
  atmosphereAlpha *= mix(0.24, 0.68, smoothstep(-0.2, 0.45, viewSunCosine));
  atmosphereAlpha = pow(atmosphereAlpha, uEarthPipeline > 0.5 ? 1.12 : 1.4);
  vec3 isolatedEmission = vec3(0.0);
  float isolatedEmissionAlpha = 0.0;
  if (hitsSurface) {
    vec3 surfacePoint = rayOrigin + rayDirection * planetHit.x;
    vec3 normal = normalize(surfacePoint);
    vec3 rotatedNormal = bodyDirection(normal, uTime * uSpin);
    float lightFacing = dot(normal, uSunDirection);
    float directLight = max(lightFacing, 0.0);
    float surfaceVariation = valueNoise(rotatedNormal * 2.8) * 0.65 + valueNoise(rotatedNormal * 7.0) * 0.35;
    vec3 daySurface = uSurfaceDay * mix(0.62, 1.28, surfaceVariation);
    vec3 nightSurface = uSurfaceNight;
    vec3 shadingNormal = normal;
    vec3 tangentCandidate = vec3(normal.z, 0.0, -normal.x);
    vec3 tangent = length(tangentCandidate) > 0.0001
      ? normalize(tangentCandidate)
      : vec3(1.0, 0.0, 0.0);
    vec3 bitangent = normalize(cross(normal, tangent));
    float oceanMask = 0.0;
    float surfaceRoughness = 0.82;
    if (uHasSurfaceSource > 0.5) {
      daySurface = sampleEquirectangular(uDayTexture, rotatedNormal).rgb;
      nightSurface = sampleEquirectangular(uNightTexture, rotatedNormal).rgb;
      surfaceRoughness = clamp(
        sampleEquirectangular(uRoughnessTexture, rotatedNormal).r,
        uEarthPipeline > 0.5 ? 0.32 : 0.04,
        1.0
      );
      oceanMask = uHasMaterialSource > 0.5
        ? sampleEquirectangular(uMaterialTexture, rotatedNormal).r
        : 1.0 - smoothstep(0.28, 0.58, surfaceRoughness);
      oceanMask = smoothstep(0.08, 0.92, oceanMask);
      vec3 mappedNormal = sampleEquirectangular(uNormalTexture, rotatedNormal).rgb * 2.0 - 1.0;
      mappedNormal.xy *= 0.35;
      shadingNormal = normalize(
        tangent * mappedNormal.x + bitangent * mappedNormal.y + normal * mappedNormal.z
      );
      if (uEarthPipeline > 0.5 && oceanMask > 0.001) {
        vec2 waveSlope = oceanWaveSlope(sphereUv(rotatedNormal));
        vec3 waveNormal = normalize(
          normal -
          tangent * waveSlope.x * uOceanWaveStrength * 0.035 -
          bitangent * waveSlope.y * uOceanWaveStrength * 0.035
        );
        shadingNormal = normalize(mix(shadingNormal, waveNormal, oceanMask));
        surfaceRoughness = mix(
          surfaceRoughness,
          mix(0.052, 0.14, clamp(length(waveSlope) * 0.42, 0.0, 1.0)),
          oceanMask
        );
      }
    }
    float wrappedLight = smoothstep(-0.5, 0.85, lightFacing);
    vec3 directionalTint = mix(uSunColor, vec3(1.0), smoothstep(-0.05, 0.7, lightFacing));
    vec3 surface;
    if (uHasSurfaceSource > 0.5) {
      float nightVisibility = 1.0 - smoothstep(-0.12, 0.08, lightFacing);
      vec3 reflectance = mix(
        vec3(0.04),
        vec3(uEarthPipeline > 0.5 ? 0.021 : 0.02),
        oceanMask
      );
      float cloudOpticalDepth = 0.0;
      float cloudLightingGradient = 0.5;
      float cloudShadow = 0.0;
      vec3 cloudNormal = normal;
      if (uEarthPipeline > 0.5) {
        float cloudRadius = uPlanetRadius + max(uCloudHeight, 0.0004);
        vec2 cloudHit = raySphereIntersect(rayOrigin, rayDirection, cloudRadius);
        vec3 cloudPoint = rayOrigin + rayDirection * max(cloudHit.x, 0.0);
        cloudNormal = normalize(cloudPoint);
        vec3 rotatedCloudNormal = bodyDirection(
          cloudNormal,
          uTime * uSpin * CLOUD_SPIN_RATIO
        );
        float coverage = cloudCoverage(rotatedCloudNormal);
        cloudOpticalDepth = 1.0 - exp(-coverage * 2.6);
        vec3 rotatedSunDirection = bodyDirection(
          uSunDirection,
          uTime * uSpin * CLOUD_SPIN_RATIO
        );
        vec3 cloudSunTangent =
          rotatedSunDirection - rotatedCloudNormal * dot(rotatedCloudNormal, rotatedSunDirection);
        if (length(cloudSunTangent) > 0.0001) {
          float towardSunCoverage = cloudCoverage(
            normalize(rotatedCloudNormal + normalize(cloudSunTangent) * 0.011)
          );
          cloudLightingGradient = clamp(0.5 + (coverage - towardSunCoverage) * 1.8, 0.0, 1.0);
        }
        vec3 shadowOrigin = surfacePoint + normal * 0.0002;
        vec2 shadowHit = raySphereIntersect(shadowOrigin, uSunDirection, cloudRadius);
        if (shadowHit.y > 0.0 && directLight > 0.0) {
          vec3 shadowShellNormal = normalize(shadowOrigin + uSunDirection * shadowHit.y);
          vec3 rotatedShadowNormal = bodyDirection(
            shadowShellNormal,
            uTime * uSpin * CLOUD_SPIN_RATIO
          );
          cloudShadow = cloudCoverage(rotatedShadowNormal) * directLight;
        }
      }
      surface = daySurface * 0.018;
      vec3 directSurface = pbrDirectLight(
        daySurface,
        shadingNormal,
        normalize(-rayDirection),
        uSunDirection,
        surfaceRoughness,
        reflectance
      );
      if (uEarthPipeline > 0.5) {
        directSurface += oceanSunGlitter(
          shadingNormal,
          normalize(-rayDirection),
          uSunDirection,
          oceanMask,
          rotatedNormal
        );
      }
      surface += directSurface * (uEarthPipeline > 0.5 ? 1.0 : 1.2549);
      surface *= 1.0 - cloudShadow * uCloudShadowIntensity;
      surface +=
        daySurface * sampleMultipleScattering(surfacePoint) *
        (0.16 + 0.18 * (1.0 - oceanMask));

      if (uEarthPipeline > 0.5) {
        float lightEnergy = max(dot(nightSurface, vec3(0.65, 0.45, -0.72)) - 0.006, 0.0);
        vec3 warmCityLights = lightEnergy * vec3(2.4, 0.9, 0.18);
        isolatedEmission =
          warmCityLights * nightVisibility * 5.6 * uNightLightIntensity *
          (1.0 - cloudOpticalDepth * 0.72);
        surface += isolatedEmission;

        float cloudLight = max(dot(cloudNormal, uSunDirection), 0.0);
        float cloudView = max(dot(cloudNormal, -rayDirection), 0.0);
        float silverLining = pow(1.0 - cloudView, 3.2) * smoothstep(-0.04, 0.42, cloudLight);
        vec3 cloudShadowColor = vec3(0.014, 0.03, 0.062);
        vec3 cloudLightColor = uSunColor *
          (0.1 + cloudLight * mix(0.56, 0.82, cloudLightingGradient) + silverLining);
        vec3 cloudColor = mix(cloudShadowColor, cloudLightColor, smoothstep(-0.08, 0.5, cloudLight));
        float cloudAlpha = cloudOpticalDepth * mix(0.42, 0.76, cloudLight);
        surface = surface * (1.0 - cloudAlpha * 0.78) + cloudColor * cloudAlpha;
      } else {
        surface += nightSurface * nightVisibility * 1.45;
      }
    } else {
      surface = nightSurface * 0.28 + daySurface * directionalTint * wrappedLight * 0.86;
    }

    float viewFacing = max(dot(normal, -rayDirection), 0.0);
    float nightSide = 1.0 - smoothstep(-0.5, 0.12, lightFacing);
    float rayleighMaximum = max(max(uRayleighScattering.r, uRayleighScattering.g), uRayleighScattering.b);
    vec3 rayleighTint = uRayleighScattering / max(rayleighMaximum, 0.0001);
    float earthshine = nightSide * (0.0035 + 0.0075 * pow(viewFacing, 0.7));
    surface += daySurface * mix(vec3(0.38, 0.52, 0.72), rayleighTint, 0.55) * earthshine;

    vec3 halfDirection = normalize(uSunDirection - rayDirection);
    float satinSheen = pow(max(dot(normal, halfDirection), 0.0), 12.0) * directLight;
    if (uHasSurfaceSource < 0.5) surface += uSunColor * satinSheen * 0.035;

    vec3 viewExtinction =
      uRayleighScattering * viewOpticalDepth.x +
      uMieExtinction * viewOpticalDepth.y * uAerosol +
      uOzoneAbsorption * viewOpticalDepth.z;
    vec3 viewTransmittance = exp(-viewExtinction);
    color =
      surface * viewTransmittance + atmosphere * (uEarthPipeline > 0.5 ? 0.46 : 0.32);
    float edgeWidth = max(fwidth(closestApproach) * 1.25, 0.0002);
    float surfaceCoverage = 1.0 - smoothstep(
      uPlanetRadius - edgeWidth,
      uPlanetRadius + edgeWidth,
      closestApproach
    );
    alpha = max(surfaceCoverage, atmosphereAlpha);
    isolatedEmission *= viewTransmittance * surfaceCoverage;
    isolatedEmissionAlpha =
      (1.0 - exp(-dot(isolatedEmission, vec3(0.24, 0.68, 0.08)) * 0.9)) * surfaceCoverage;
  } else {
    color = atmosphere * (uEarthPipeline > 0.5 ? 0.92 : 0.65);
    alpha = atmosphereAlpha;
  }

  if (uEarthPipeline > 0.5) {
    fragColor = vec4(color * alpha, alpha);
  } else {
    color = pow(filmic(color), vec3(1.0 / 2.2));
    fragColor = vec4(color * alpha, alpha);
  }
  emissionColor = vec4(isolatedEmission, isolatedEmissionAlpha);
}
`

const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uAtmosphere;

out vec4 fragColor;

float hash(vec2 value) {
  return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 atmosphere = texture(uAtmosphere, vUv);
  vec2 centered = vUv - 0.5;
  float radialDistance = length(centered);
  vec2 radialDirection = centered / max(radialDistance, 0.0001);
  float blurDistance = smoothstep(0.16, 0.52, radialDistance) * 0.0024;
  vec4 outward = texture(uAtmosphere, vUv + radialDirection * blurDistance);
  vec4 inward = texture(uAtmosphere, vUv - radialDirection * blurDistance);
  vec4 softened = (atmosphere * 2.0 + outward + inward) * 0.25;
  vec3 dispersed = vec3(outward.r, atmosphere.g, inward.b);
  atmosphere = mix(atmosphere, softened, 0.2);
  atmosphere.rgb = mix(atmosphere.rgb, dispersed, 0.1);
  float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  atmosphere.rgb = max(atmosphere.rgb + dither * atmosphere.a, 0.0);
  fragColor = atmosphere;
}
`

const BLOOM_DOWNSAMPLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uSource;
uniform vec2 uTexelSize;

out vec4 fragColor;

void main() {
  vec4 center = texture(uSource, vUv) * 0.25;
  vec4 corners =
    texture(uSource, vUv + uTexelSize * vec2(-1.0, -1.0)) +
    texture(uSource, vUv + uTexelSize * vec2(1.0, -1.0)) +
    texture(uSource, vUv + uTexelSize * vec2(-1.0, 1.0)) +
    texture(uSource, vUv + uTexelSize * vec2(1.0, 1.0));
  vec4 bloom = center + corners * 0.1875;
  bloom.rgb = max(bloom.rgb - vec3(0.004), 0.0) * 1.18;
  fragColor = bloom;
}
`

const BLOOM_BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

uniform vec2 uDirection;
uniform sampler2D uSource;
uniform vec2 uTexelSize;

out vec4 fragColor;

void main() {
  vec2 offset = uDirection * uTexelSize;
  vec4 result = texture(uSource, vUv) * 0.227027;
  result += texture(uSource, vUv + offset * 1.384615) * 0.316216;
  result += texture(uSource, vUv - offset * 1.384615) * 0.316216;
  result += texture(uSource, vUv + offset * 3.230769) * 0.070270;
  result += texture(uSource, vUv - offset * 3.230769) * 0.070270;
  fragColor = result;
}
`

const EARTH_COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uBloom;
uniform sampler2D uScene;

out vec4 fragColor;

float hash(vec2 value) {
  return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 filmic(vec3 color) {
  color = max(color, 0.0);
  return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec4 scene = texture(uScene, vUv);
  vec2 centered = vUv - 0.5;
  float radialDistance = length(centered);
  vec2 radialDirection = centered / max(radialDistance, 0.0001);
  float blurDistance = smoothstep(0.16, 0.52, radialDistance) * 0.0032;
  vec4 outward = texture(uScene, vUv + radialDirection * blurDistance);
  vec4 inward = texture(uScene, vUv - radialDirection * blurDistance);
  scene = mix(scene, (scene * 2.0 + outward + inward) * 0.25, 0.14);

  vec4 bloom = texture(uBloom, vUv);
  float bloomAlpha = clamp(
    bloom.a * 1.25 + dot(bloom.rgb, vec3(0.24, 0.68, 0.08)) * 0.09,
    0.0,
    1.0
  );
  float alpha = 1.0 - (1.0 - scene.a) * (1.0 - bloomAlpha);
  vec3 premultiplied = scene.rgb + bloom.rgb * 1.28;
  vec3 straightColor = premultiplied / max(alpha, 0.0001);
  vec3 mapped = pow(filmic(straightColor), vec3(1.0 / 2.2));
  float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  mapped = max(mapped + dither, 0.0);
  fragColor = vec4(mapped * alpha, alpha);
}
`

type EarthResources = {
  bloomA: RenderTarget
  bloomB: RenderTarget
  blurProgram: WebGLProgram
  cloudTexture: WebGLTexture
  compositeProgram: WebGLProgram
  downsampleProgram: WebGLProgram
  emission: RenderTarget
}

type AtmosphericResources = {
  atmosphere: RenderTarget
  atmosphereProgram: WebGLProgram
  compositeProgram: WebGLProgram
  dayTexture: WebGLTexture
  /** Cloud/bloom pipeline; created on the first upload of a surface with clouds. */
  earth: EarthResources | null
  hasCloudSource: boolean
  hasMaterialSource: boolean
  hasSurfaceSource: boolean
  /** Radians, derived from the uploaded surface. */
  longitudeOffset: number
  materialTexture: WebGLTexture
  multipleScattering: RenderTarget
  multipleScatteringProgram: WebGLProgram
  nightTexture: WebGLTexture
  normalTexture: WebGLTexture
  roughnessTexture: WebGLTexture
  transmittance: RenderTarget
  /** Serialised physical inputs the cached transmittance LUT was built from. */
  transmittanceKey: string
  transmittanceProgram: WebGLProgram
  uniform: UniformResolver
}

function bloomSize(size: number): number {
  return Math.max(Math.ceil(size / 4), 1)
}

function createEarthResources(
  gl: WebGL2RenderingContext,
  atmosphere: RenderTarget,
): EarthResources {
  const emission = createRenderTarget(
    gl,
    'Earth emission',
    atmosphere.width,
    atmosphere.height,
    atmosphere.internalFormat,
    atmosphere.type,
  )
  // Attach emission as a second colour output of the atmosphere pass.
  gl.bindFramebuffer(gl.FRAMEBUFFER, atmosphere.framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, emission.texture, 0)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
    throw new Error(`Earth framebuffer is incomplete (status ${status})`)
  }

  const bloomWidth = bloomSize(atmosphere.width)
  const bloomHeight = bloomSize(atmosphere.height)
  return {
    bloomA: createRenderTarget(
      gl,
      'Earth bloom A',
      bloomWidth,
      bloomHeight,
      atmosphere.internalFormat,
      atmosphere.type,
    ),
    bloomB: createRenderTarget(
      gl,
      'Earth bloom B',
      bloomWidth,
      bloomHeight,
      atmosphere.internalFormat,
      atmosphere.type,
    ),
    blurProgram: createProgram(gl, BLOOM_BLUR_FRAGMENT_SHADER, 'Earth bloom blur'),
    cloudTexture: createTexture(gl, 'Earth cloud', { placeholder: [0, 0, 0, 255] }),
    compositeProgram: createProgram(gl, EARTH_COMPOSITE_FRAGMENT_SHADER, 'Earth composite'),
    downsampleProgram: createProgram(
      gl,
      BLOOM_DOWNSAMPLE_FRAGMENT_SHADER,
      'Earth bloom downsample',
    ),
    emission,
  }
}

function deleteEarthResources(gl: WebGL2RenderingContext, resources: EarthResources): void {
  deleteRenderTarget(gl, resources.bloomA)
  deleteRenderTarget(gl, resources.bloomB)
  deleteRenderTarget(gl, resources.emission)
  gl.deleteTexture(resources.cloudTexture)
  gl.deleteProgram(resources.blurProgram)
  gl.deleteProgram(resources.compositeProgram)
  gl.deleteProgram(resources.downsampleProgram)
}

function resizeEarthResources(
  gl: WebGL2RenderingContext,
  earth: EarthResources,
  width: number,
  height: number,
): void {
  resizeRenderTarget(gl, earth.emission, width, height)
  resizeRenderTarget(gl, earth.bloomA, bloomSize(width), bloomSize(height))
  resizeRenderTarget(gl, earth.bloomB, bloomSize(width), bloomSize(height))
}

function setColor(
  gl: WebGL2RenderingContext,
  uniform: UniformResolver,
  program: WebGLProgram,
  name: string,
  color: AtmosphericOrbColor,
): void {
  gl.uniform3f(uniform(program, name), ...color)
}

function setPhysicalUniforms(
  gl: WebGL2RenderingContext,
  uniform: UniformResolver,
  program: WebGLProgram,
  current: AtmosphericFrameSettings,
): void {
  const atmosphereRadius = PLANET_RADIUS + current.atmosphereThickness
  gl.uniform1f(uniform(program, 'uAerosol'), current.aerosol)
  gl.uniform1f(uniform(program, 'uDensity'), current.density)
  gl.uniform1f(uniform(program, 'uAtmosphereRadius'), atmosphereRadius)
  gl.uniform1f(uniform(program, 'uPlanetRadius'), PLANET_RADIUS)
  setColor(gl, uniform, program, 'uMieExtinction', current.model.mieExtinction)
  setColor(gl, uniform, program, 'uOzoneAbsorption', current.model.ozoneAbsorption)
  setColor(gl, uniform, program, 'uRayleighScattering', current.model.rayleighScattering)
}

/** Rebuild the transmittance and multiple-scattering LUTs when their inputs change. */
function renderTransmittance(
  gl: WebGL2RenderingContext,
  resources: AtmosphericResources,
  current: AtmosphericFrameSettings,
): void {
  const { uniform } = resources
  const nextKey = JSON.stringify([
    current.aerosol,
    current.atmosphereThickness,
    current.density,
    current.model.mieExtinction,
    current.model.mieScattering,
    current.model.ozoneAbsorption,
    current.model.rayleighScattering,
  ])
  if (nextKey === resources.transmittanceKey) return
  resources.transmittanceKey = nextKey
  gl.bindFramebuffer(gl.FRAMEBUFFER, resources.transmittance.framebuffer)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0])
  gl.viewport(0, 0, resources.transmittance.width, resources.transmittance.height)
  gl.useProgram(resources.transmittanceProgram)
  setPhysicalUniforms(gl, uniform, resources.transmittanceProgram, current)
  gl.drawArrays(gl.TRIANGLES, 0, 3)

  gl.bindFramebuffer(gl.FRAMEBUFFER, resources.multipleScattering.framebuffer)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0])
  gl.viewport(0, 0, resources.multipleScattering.width, resources.multipleScattering.height)
  gl.useProgram(resources.multipleScatteringProgram)
  setPhysicalUniforms(gl, uniform, resources.multipleScatteringProgram, current)
  setColor(
    gl,
    uniform,
    resources.multipleScatteringProgram,
    'uMieScattering',
    current.model.mieScattering,
  )
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, resources.transmittance.texture)
  gl.uniform1i(uniform(resources.multipleScatteringProgram, 'uTransmittance'), 0)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function renderBloom(
  gl: WebGL2RenderingContext,
  uniform: UniformResolver,
  earth: EarthResources,
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, earth.bloomA.framebuffer)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0])
  gl.viewport(0, 0, earth.bloomA.width, earth.bloomA.height)
  gl.useProgram(earth.downsampleProgram)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, earth.emission.texture)
  gl.uniform1i(uniform(earth.downsampleProgram, 'uSource'), 0)
  gl.uniform2f(
    uniform(earth.downsampleProgram, 'uTexelSize'),
    1 / earth.emission.width,
    1 / earth.emission.height,
  )
  gl.drawArrays(gl.TRIANGLES, 0, 3)

  function blur(
    sourceTarget: RenderTarget,
    target: RenderTarget,
    directionX: number,
    directionY: number,
  ): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0])
    gl.viewport(0, 0, target.width, target.height)
    gl.useProgram(earth.blurProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTarget.texture)
    gl.uniform1i(uniform(earth.blurProgram, 'uSource'), 0)
    gl.uniform2f(
      uniform(earth.blurProgram, 'uTexelSize'),
      1 / sourceTarget.width,
      1 / sourceTarget.height,
    )
    gl.uniform2f(uniform(earth.blurProgram, 'uDirection'), directionX, directionY)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  blur(earth.bloomA, earth.bloomB, 1, 0)
  blur(earth.bloomB, earth.bloomA, 0, 1)
  blur(earth.bloomA, earth.bloomB, 1, 0)
  blur(earth.bloomB, earth.bloomA, 0, 1)
}

const spec: OrbRendererSpec<AtmosphericResources, AtmosphericFrameSettings, AtmosphericSurface> = {
  label: 'Earth',
  createResources(gl) {
    const useHighPrecisionTargets = Boolean(gl.getExtension('EXT_color_buffer_float'))
    const internalFormat = useHighPrecisionTargets ? gl.RGBA16F : gl.RGBA8
    const type = useHighPrecisionTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE
    return {
      atmosphere: createRenderTarget(gl, 'Earth atmosphere', 1, 1, internalFormat, type),
      atmosphereProgram: createProgram(gl, ATMOSPHERE_FRAGMENT_SHADER, 'Earth atmosphere'),
      compositeProgram: createProgram(gl, COMPOSITE_FRAGMENT_SHADER, 'Earth composite'),
      dayTexture: createTexture(gl, 'Earth day', {
        internalFormat: gl.SRGB8_ALPHA8,
        placeholder: [255, 255, 255, 255],
      }),
      earth: null,
      hasCloudSource: false,
      hasMaterialSource: false,
      hasSurfaceSource: false,
      longitudeOffset: 0,
      materialTexture: createTexture(gl, 'Earth material', { placeholder: [0, 0, 0, 255] }),
      multipleScattering: createRenderTarget(
        gl,
        'Earth multiple scattering',
        32,
        32,
        internalFormat,
        type,
      ),
      multipleScatteringProgram: createProgram(
        gl,
        MULTIPLE_SCATTERING_FRAGMENT_SHADER,
        'Earth multiple scattering',
      ),
      nightTexture: createTexture(gl, 'Earth night', {
        internalFormat: gl.SRGB8_ALPHA8,
        placeholder: [0, 0, 0, 255],
      }),
      normalTexture: createTexture(gl, 'Earth normal', { placeholder: [128, 128, 255, 255] }),
      roughnessTexture: createTexture(gl, 'Earth roughness', { placeholder: [209, 209, 209, 255] }),
      transmittance: createRenderTarget(gl, 'Earth transmittance', 256, 64, internalFormat, type),
      transmittanceKey: '',
      transmittanceProgram: createProgram(gl, TRANSMITTANCE_FRAGMENT_SHADER, 'Earth transmittance'),
      uniform: createUniformResolver(gl),
    }
  },
  deleteResources(gl, resources) {
    if (resources.earth) deleteEarthResources(gl, resources.earth)
    deleteRenderTarget(gl, resources.atmosphere)
    deleteRenderTarget(gl, resources.multipleScattering)
    deleteRenderTarget(gl, resources.transmittance)
    gl.deleteTexture(resources.dayTexture)
    gl.deleteTexture(resources.materialTexture)
    gl.deleteTexture(resources.nightTexture)
    gl.deleteTexture(resources.normalTexture)
    gl.deleteTexture(resources.roughnessTexture)
    gl.deleteProgram(resources.atmosphereProgram)
    gl.deleteProgram(resources.compositeProgram)
    gl.deleteProgram(resources.multipleScatteringProgram)
    gl.deleteProgram(resources.transmittanceProgram)
  },
  resize(gl, resources, size) {
    resizeRenderTarget(gl, resources.atmosphere, size.width, size.height)
    if (resources.earth) resizeEarthResources(gl, resources.earth, size.width, size.height)
  },
  upload(gl, resources, surface) {
    // The cloud pipeline is only built once a surface actually ships clouds.
    if (surface.cloud) resources.earth ??= createEarthResources(gl, resources.atmosphere)
    const { earth } = resources
    withUnpackState(gl, { flipY: true, premultiplyAlpha: false }, () => {
      uploadImage(gl, resources.dayTexture, surface.day, { internalFormat: gl.SRGB8_ALPHA8 })
      uploadImage(gl, resources.nightTexture, surface.night, { internalFormat: gl.SRGB8_ALPHA8 })
      uploadImage(gl, resources.normalTexture, surface.normal)
      uploadImage(gl, resources.roughnessTexture, surface.roughness)
      if (surface.material) uploadImage(gl, resources.materialTexture, surface.material)
      if (surface.cloud && earth) uploadImage(gl, earth.cloudTexture, surface.cloud)
    })
    resources.hasCloudSource = surface.cloud !== undefined
    resources.hasMaterialSource = surface.material !== undefined
    resources.hasSurfaceSource = true
    resources.longitudeOffset = (surface.longitudeOffsetDegrees ?? 0) * (Math.PI / 180)
  },
  keepPointerOnLeave(settings) {
    return settings.lean && settings.sunOrbit === 0
  },
  render(gl, resources, frame) {
    const { composition, elapsed, pointerX, pointerY, settings: current } = frame
    const { uniform } = resources

    renderTransmittance(gl, resources, current)

    const baseAzimuth = current.sunAzimuth * (Math.PI / 180)
    const aimSun = current.sunOrbit === 0
    const orbitAngle = aimSun
      ? baseAzimuth + pointerX * Math.PI
      : elapsed * ((current.sunOrbit * Math.PI) / 180) + baseAzimuth + pointerX * 0.42
    const elevationOffset = pointerY * (aimSun ? 55 : 20)
    const elevation = (current.sunElevation + elevationOffset) * (Math.PI / 180)
    const elevationCosine = Math.cos(elevation)
    const sunDirection: AtmosphericOrbColor = [
      Math.cos(orbitAngle) * elevationCosine,
      Math.sin(elevation),
      Math.sin(orbitAngle) * elevationCosine,
    ]
    const earth = resources.hasCloudSource ? resources.earth : null
    const { atmosphereProgram } = resources

    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.atmosphere.framebuffer)
    gl.drawBuffers(earth ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1] : [gl.COLOR_ATTACHMENT0])
    gl.viewport(0, 0, resources.atmosphere.width, resources.atmosphere.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(atmosphereProgram)
    setPhysicalUniforms(gl, uniform, atmosphereProgram, current)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.transmittance.texture)
    gl.uniform1i(uniform(atmosphereProgram, 'uTransmittance'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, resources.dayTexture)
    gl.uniform1i(uniform(atmosphereProgram, 'uDayTexture'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, resources.nightTexture)
    gl.uniform1i(uniform(atmosphereProgram, 'uNightTexture'), 2)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, resources.normalTexture)
    gl.uniform1i(uniform(atmosphereProgram, 'uNormalTexture'), 3)
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, resources.roughnessTexture)
    gl.uniform1i(uniform(atmosphereProgram, 'uRoughnessTexture'), 4)
    if (earth) {
      gl.activeTexture(gl.TEXTURE5)
      gl.bindTexture(gl.TEXTURE_2D, earth.cloudTexture)
      gl.uniform1i(uniform(atmosphereProgram, 'uCloudTexture'), 5)
    }
    gl.activeTexture(gl.TEXTURE6)
    gl.bindTexture(gl.TEXTURE_2D, resources.materialTexture)
    gl.uniform1i(uniform(atmosphereProgram, 'uMaterialTexture'), 6)
    gl.activeTexture(gl.TEXTURE7)
    gl.bindTexture(gl.TEXTURE_2D, resources.multipleScattering.texture)
    gl.uniform1i(uniform(atmosphereProgram, 'uMultipleScatteringTexture'), 7)
    gl.uniform1f(uniform(atmosphereProgram, 'uCloudDensity'), current.cloudDensity)
    gl.uniform2f(
      uniform(atmosphereProgram, 'uCompositionCenter'),
      composition.centerX,
      composition.centerY,
    )
    // Size stays locked to composition height so a taller canvas does not shrink the globe.
    gl.uniform1f(uniform(atmosphereProgram, 'uCompositionScale'), composition.height)
    gl.uniform2f(
      uniform(atmosphereProgram, 'uResolution'),
      resources.atmosphere.width,
      resources.atmosphere.height,
    )
    gl.uniform1f(uniform(atmosphereProgram, 'uCloudHeight'), current.cloudHeight / 100)
    gl.uniform1f(uniform(atmosphereProgram, 'uCloudShadowIntensity'), current.cloudShadowIntensity)
    gl.uniform1f(uniform(atmosphereProgram, 'uEarthPipeline'), earth ? 1 : 0)
    gl.uniform1f(
      uniform(atmosphereProgram, 'uHasSurfaceSource'),
      resources.hasSurfaceSource ? 1 : 0,
    )
    gl.uniform1f(
      uniform(atmosphereProgram, 'uHasMaterialSource'),
      resources.hasMaterialSource ? 1 : 0,
    )
    gl.uniform1f(uniform(atmosphereProgram, 'uLongitudeOffset'), resources.longitudeOffset)
    gl.uniform1f(uniform(atmosphereProgram, 'uTilt'), (current.tilt * Math.PI) / 180)
    gl.uniform1f(uniform(atmosphereProgram, 'uYaw'), (current.yaw * Math.PI) / 180)
    gl.uniform1f(uniform(atmosphereProgram, 'uSunIntensity'), current.model.sunIntensity)
    gl.uniform1f(uniform(atmosphereProgram, 'uMultipleScattering'), current.multipleScattering)
    gl.uniform1f(uniform(atmosphereProgram, 'uNightLightIntensity'), current.cityLights)
    gl.uniform1f(uniform(atmosphereProgram, 'uOceanGlint'), current.oceanGlint)
    gl.uniform1f(uniform(atmosphereProgram, 'uOceanWaveStrength'), current.oceanWaveStrength)
    gl.uniform1f(uniform(atmosphereProgram, 'uSpin'), (current.spin * Math.PI) / 180)
    gl.uniform1f(uniform(atmosphereProgram, 'uTime'), elapsed)
    gl.uniform3f(uniform(atmosphereProgram, 'uSunDirection'), ...sunDirection)
    setColor(gl, uniform, atmosphereProgram, 'uMieScattering', current.model.mieScattering)
    setColor(gl, uniform, atmosphereProgram, 'uSpaceColor', current.model.space)
    setColor(gl, uniform, atmosphereProgram, 'uSunColor', current.model.sun)
    setColor(gl, uniform, atmosphereProgram, 'uSurfaceDay', current.model.surfaceDay)
    setColor(gl, uniform, atmosphereProgram, 'uSurfaceNight', current.model.surfaceNight)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    if (earth) renderBloom(gl, uniform, earth)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, frame.width, frame.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const compositeProgram = earth ? earth.compositeProgram : resources.compositeProgram
    gl.useProgram(compositeProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.atmosphere.texture)
    if (earth) {
      gl.uniform1i(uniform(compositeProgram, 'uScene'), 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, earth.bloomA.texture)
      gl.uniform1i(uniform(compositeProgram, 'uBloom'), 1)
    } else {
      gl.uniform1i(uniform(compositeProgram, 'uAtmosphere'), 0)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function AtmosphericOrbEffect({
  aerosol = 1,
  atmosphereThickness = 0.16,
  cityLights = 1,
  className,
  cloudDensity = 1,
  cloudHeight = 1.2,
  cloudShadowIntensity = 0.48,
  composition,
  density = 1,
  lean = true,
  model = defaultEarthModel,
  multipleScattering = 1,
  oceanGlint = 0.72,
  oceanWaveStrength = 0.8,
  onError,
  paused,
  source,
  spin = 1.4,
  style,
  sunAzimuth = -41.25,
  sunElevation = 8,
  sunOrbit = 4.6,
  tilt = 0,
  viewport,
  yaw = 0,
}: AtmosphericOrbEffectProps) {
  const settings: AtmosphericFrameSettings = {
    aerosol,
    atmosphereThickness,
    cityLights,
    cloudDensity,
    cloudHeight,
    cloudShadowIntensity,
    density,
    lean,
    model,
    multipleScattering,
    oceanGlint,
    oceanWaveStrength,
    spin,
    sunAzimuth,
    sunElevation,
    sunOrbit,
    tilt,
    yaw,
  }

  return (
    <OrbCanvas
      backgroundColor="#07080d"
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
