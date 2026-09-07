'use client'

import { OrbCanvas } from '../internal/orb-canvas'
import type { OrbRendererSpec, OrbSource } from '../internal/orb-renderer'
import { getUniformLocations, type UniformLocations } from '../internal/uniforms'
import {
  COMPOSITION_GLSL,
  COMPOSITION_UNIFORM_NAMES,
  createProgram,
  createVertexArray,
  degreesToRadians,
  sunDirection,
  withUnpackState,
} from '../internal/webgl'
import type { OrbCanvasProps, OrbLightingProps, OrbPoseProps } from '../orb'

export type NeptunianDataPlane = {
  data: Uint8Array
  height: number
  width: number
}

export type NeptunianVortex = {
  angularRadiiDegrees: readonly [longitude: number, latitude: number]
  latitudeDegrees: number
  longitudeDegrees: number
}

export type NeptunianSurface = {
  /** Single-channel equirectangular coverage of bright high-altitude clouds. */
  highClouds: NeptunianDataPlane
  /** Single-channel equirectangular optical depth of the main cloud deck. */
  opticalDepth: NeptunianDataPlane
  /** Great Dark Spot placement; omit for a vortex-free disc. */
  vortex?: NeptunianVortex
  /** Single-row zonal wind profile by latitude, 0.5 = calm. */
  zonalWind: NeptunianDataPlane
}

export type NeptunianOrbSource = OrbSource<NeptunianSurface>

export type NeptunianOrbEffectProps = OrbCanvasProps &
  Omit<OrbPoseProps, 'tilt'> &
  OrbLightingProps & {
    /** Directional shading and shadowing of the high cloud streaks. Range 0–2. @default 1 */
    cloudRelief?: number
    /** Bright companion cloud trailing the dark vortex. Range 0–1. @default 0.68 */
    companionCloud?: number
    /** Optical depth of the deep cloud deck that methane absorption acts on. Range 0–1.5. @default 0.72 */
    deepOpticalDepth?: number
    /** Linear scene gain before tone mapping. @default 0.72 */
    exposure?: number
    /** Polar flattening in percent. Range 0–12. @default 1.7 */
    flattening?: number
    /** Fine turbulent cloud detail advected with the winds. Range 0–1. @default 0.34 */
    flowDetail?: number
    /** Forward-scatter brightening of the upper haze near the limb. Range 0–1. @default 0.28 */
    forwardScattering?: number
    /** Optical depth of the upper haze shell. Range 0–1. @default 0.48 */
    hazeOpticalDepth?: number
    /** Methane absorption strength; deepens the blue. Range 0–1.5. @default 0.78 */
    methaneAbsorption?: number
    source: NeptunianOrbSource
    /**
     * View-space rotation of the weather map in degrees; it does not change the
     * lighting geometry.
     * @default 18
     */
    tilt?: number
    /** Coverage of bright high-altitude methane clouds. Range 0–1. @default 0.68 */
    upperClouds?: number
    /** Scattering strength of the upper haze shell. Range 0–1. @default 0.3 */
    upperHaze?: number
    /** Rotational flow speed inside and around the dark vortex. Range 0–1. @default 0.48 */
    vortexCirculation?: number
    /** How much the dark vortex darkens the cloud deck. Range 0–1. @default 0.5 */
    vortexDarkness?: number
    /** Zonal wind speed multiplier driving cloud advection. Range 0–1. @default 0.62 */
    windScale?: number
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uCloudRelief',
  'uCompanionCloud',
  'uDeepOpticalDepth',
  'uExposure',
  'uFlattening',
  'uFlowDetail',
  'uForwardScattering',
  'uHazeOpticalDepth',
  'uHighCloudTexture',
  'uMethaneAbsorption',
  'uOpticalDepthTexture',
  'uPointer',
  'uSourceReady',
  'uSunDirection',
  'uTime',
  'uUpperClouds',
  'uUpperHaze',
  'uVortexCenter',
  'uVortexCirculation',
  'uVortexDarkness',
  'uVortexRadii',
  'uWeatherTilt',
  'uWindScale',
  'uYaw',
  'uZonalWindTexture',
] as const

type NeptunianResources = {
  highCloudTexture: WebGLTexture
  opticalDepthTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
  /** Radians (longitude, latitude), derived from the uploaded surface. */
  vortexCenter: [number, number]
  /** Radians (longitude, latitude); zero disables the vortex. */
  vortexRadii: [number, number]
  zonalWindTexture: WebGLTexture
}

type NeptunianFrameSettings = {
  cloudRelief: number
  companionCloud: number
  deepOpticalDepth: number
  exposure: number
  flattening: number
  flowDetail: number
  forwardScattering: number
  hazeOpticalDepth: number
  lean: boolean
  methaneAbsorption: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  tilt: number
  upperClouds: number
  upperHaze: number
  vortexCirculation: number
  vortexDarkness: number
  windScale: number
  yaw: number
}

const BODY_RADIUS = 0.78
const HAZE_RADIUS = 0.81

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform float uCloudRelief;
uniform float uCompanionCloud;
uniform float uDeepOpticalDepth;
uniform float uExposure;
uniform float uFlowDetail;
uniform float uForwardScattering;
uniform sampler2D uHighCloudTexture;
uniform float uHazeOpticalDepth;
uniform float uMethaneAbsorption;
uniform float uFlattening;
uniform sampler2D uOpticalDepthTexture;
uniform vec2 uPointer;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uYaw;
uniform float uTime;
uniform float uUpperClouds;
uniform float uUpperHaze;
uniform vec2 uVortexCenter;
uniform float uVortexCirculation;
uniform float uVortexDarkness;
uniform vec2 uVortexRadii;
uniform float uWeatherTilt;
uniform float uWindScale;
uniform sampler2D uZonalWindTexture;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float BODY_RADIUS = ${BODY_RADIUS.toFixed(3)};
const float HAZE_RADIUS = ${HAZE_RADIUS.toFixed(3)};
const float HAZE_THICKNESS = HAZE_RADIUS - BODY_RADIUS;
const float CAMERA_DISTANCE = 2.5;
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

vec2 raySphere(vec3 rayOrigin, vec3 rayDirection, float radius) {
  float projection = dot(rayOrigin, rayDirection);
  float discriminant = projection * projection - dot(rayOrigin, rayOrigin) + radius * radius;
  if (discriminant < 0.0) return vec2(-1.0);
  float root = sqrt(discriminant);
  return vec2(-projection - root, -projection + root);
}

vec2 sphereUv(vec3 direction) {
  return vec2(
    fract(atan(direction.x, direction.z) / TAU + 0.5),
    clamp(asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5, 0.0, 1.0)
  );
}

float sampleEquirectangular(sampler2D image, vec3 direction) {
  vec2 uv = sphereUv(direction);
  float radialSquared = max(direction.x * direction.x + direction.z * direction.z, 0.000001);
  vec3 directionDx = dFdx(direction);
  vec3 directionDy = dFdy(direction);
  if (radialSquared < 0.0025) {
    float polarLod = mix(2.0, 5.0, 1.0 - smoothstep(0.0, 0.0025, radialSquared));
    return textureLod(image, uv, polarLod).r;
  }

  float latitudeDenominator = max(sqrt(max(1.0 - direction.y * direction.y, 0.0)), 0.001);
  vec2 gradientX = vec2(
    (direction.z * directionDx.x - direction.x * directionDx.z) / radialSquared / TAU,
    directionDx.y / latitudeDenominator / PI
  );
  vec2 gradientY = vec2(
    (direction.z * directionDy.x - direction.x * directionDy.z) / radialSquared / TAU,
    directionDy.y / latitudeDenominator / PI
  );
  return textureGrad(image, uv, gradientX, gradientY).r;
}

vec3 directionFromLongitudeLatitude(float longitude, float latitude) {
  float latitudeCosine = cos(latitude);
  return vec3(sin(longitude) * latitudeCosine, sin(latitude), cos(longitude) * latitudeCosine);
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

float fbm(vec3 point) {
  float value = 0.0;
  float weight = 0.55;
  for (int octave = 0; octave < 4; octave += 1) {
    value += valueNoise(point) * weight;
    point = point * 2.03 + vec3(9.7, 13.1, 5.3);
    weight *= 0.47;
  }
  return value / 1.013;
}

vec3 orientedDirection(vec3 radialDirection) {
  vec3 tilted = rotateX(radialDirection, uWeatherTilt + uPointer.y * 0.1);
  return rotateY(tilted, uYaw + uPointer.x * 0.16);
}

vec2 vortexMetric(float longitude, float latitude) {
  float centerCosine = max(cos(uVortexCenter.y), 0.15);
  vec2 radii = max(uVortexRadii * vec2(centerCosine, 1.0), vec2(0.0001));
  return vec2(
    wrapAngle(longitude - uVortexCenter.x) * centerCosine,
    latitude - uVortexCenter.y
  ) / radii;
}

float vortexInfluence(float longitude, float latitude) {
  if (uVortexRadii.x <= 0.0001 || uVortexRadii.y <= 0.0001) return 0.0;
  return 1.0 - smoothstep(0.78, 1.08, length(vortexMetric(longitude, latitude)));
}

vec3 advectedDirection(vec3 direction) {
  float longitude = atan(direction.x, direction.z);
  float latitude = asin(clamp(direction.y, -1.0, 1.0));

  if (uVortexCirculation > 0.0001 && uVortexRadii.x > 0.0001) {
    vec2 local = vortexMetric(longitude, latitude);
    float influence = 1.0 - smoothstep(0.2, 1.65, length(local));
    vec2 rotated = rotate2d(local, -uTime * 0.075 * uVortexCirculation);
    vec2 warped = mix(local, rotated, influence);
    longitude = uVortexCenter.x + warped.x * uVortexRadii.x;
    latitude = uVortexCenter.y + warped.y * uVortexRadii.y;
  }

  if (uWindScale > 0.0001) {
    float wind = texture(uZonalWindTexture, vec2(latitude / PI + 0.5, 0.5)).r * 2.0 - 1.0;
    longitude += uTime * 0.035 * uWindScale * wind;
  }
  return directionFromLongitudeLatitude(longitude, latitude);
}

float movingCloudDetail(vec3 direction) {
  if (uFlowDetail <= 0.0001) return 0.0;
  float latitude = asin(clamp(direction.y, -1.0, 1.0));
  float latitudeCosine = max(cos(latitude), 0.0);
  vec3 stretched = direction * vec3(7.0, 24.0, 7.0);
  float broad = fbm(stretched * 0.55);
  float fine = fbm(stretched + (broad - 0.5) * 2.1);
  float wave = sin(latitude * 38.0 + broad * 4.8) * 0.17;
  return ((fine - 0.5) * 0.72 + (broad - 0.5) * 0.28 + wave) *
    smoothstep(0.04, 0.22, latitudeCosine) * uFlowDetail;
}

float henyeyGreenstein(float cosineTheta, float asymmetry) {
  float g2 = asymmetry * asymmetry;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * asymmetry * cosineTheta, 0.001), 1.5);
}

bool planetShadowsPoint(vec3 point, vec3 lightDirection) {
  vec2 hit = raySphere(point + lightDirection * 0.001, lightDirection, BODY_RADIUS);
  return hit.x > 0.0;
}

vec4 integrateUpperHaze(
  vec3 rayOrigin,
  vec3 rayDirection,
  float startDistance,
  float endDistance,
  vec3 lightDirection,
  vec3 viewDirection
) {
  if (uUpperHaze <= 0.0001 || uHazeOpticalDepth <= 0.0001 || endDistance <= startDistance) {
    return vec4(0.0);
  }

  float segmentLength = endDistance - startDistance;
  float stepLength = segmentLength / 8.0;
  float viewOpticalDepth = 0.0;
  vec3 scattering = vec3(0.0);
  float forwardCosine = dot(-lightDirection, viewDirection);
  float forwardPhase = uForwardScattering > 0.0001
    ? henyeyGreenstein(forwardCosine, 0.78) * uForwardScattering * 0.012
    : 0.0;
  float aerosolPhase = 0.055 + forwardPhase;
  vec3 aerosolColor = vec3(0.42, 0.72, 0.8);

  for (int stepIndex = 0; stepIndex < 8; stepIndex += 1) {
    float distance = startDistance + (float(stepIndex) + 0.5) * stepLength;
    vec3 point = rayOrigin + rayDirection * distance;
    float normalizedHeight = clamp((length(point) - BODY_RADIUS) / HAZE_THICKNESS, 0.0, 1.0);
    float density = exp(-normalizedHeight * 5.8) * (1.0 - smoothstep(0.84, 1.0, normalizedHeight));
    float normalizedStep = stepLength / HAZE_THICKNESS;
    float stepOpticalDepth = density * normalizedStep * uHazeOpticalDepth * 0.58;
    vec3 localNormal = normalize(point);
    float lightCosine = dot(localNormal, lightDirection);
    float horizonPath = 1.0 / max(
      0.1,
      lightCosine + sqrt(max(lightCosine * lightCosine + normalizedHeight * 0.14, 0.0))
    );
    float sunOpticalDepth = density * horizonPath * uHazeOpticalDepth * 0.13;
    float sunVisibility = planetShadowsPoint(point, lightDirection)
      ? 0.0
      : exp(-sunOpticalDepth);
    float viewTransmittance = exp(-viewOpticalDepth);
    float scatterAmount = density * normalizedStep * uUpperHaze * 0.1;
    scattering += aerosolColor * aerosolPhase * scatterAmount *
      sunVisibility * viewTransmittance;
    viewOpticalDepth += stepOpticalDepth;
  }

  return vec4(scattering, viewOpticalDepth);
}

vec3 methaneTransmittance(float pathLength) {
  if (uMethaneAbsorption <= 0.0001 || uDeepOpticalDepth <= 0.0001) return vec3(1.0);
  vec3 coefficients = vec3(1.16, 0.26, 0.06) * uMethaneAbsorption;
  return exp(-coefficients * pathLength * uDeepOpticalDepth);
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

float highCloudCoverage(vec3 radialDirection) {
  vec3 mappedDirection = orientedDirection(radialDirection);
  vec3 weatherDirection = advectedDirection(mappedDirection);
  float cloud = smoothstep(
    0.3,
    0.82,
    sampleEquirectangular(uHighCloudTexture, weatherDirection)
  );
  if (uCompanionCloud > 0.0001 && uVortexRadii.x > 0.0001) {
    float longitude = atan(mappedDirection.x, mappedDirection.z);
    float latitude = asin(clamp(mappedDirection.y, -1.0, 1.0));
    vec2 companionMetric = (vortexMetric(longitude, latitude) - vec2(0.32, 1.02)) *
      vec2(2.2, 3.0);
    float companion = exp(-dot(companionMetric, companionMetric)) * uCompanionCloud;
    cloud = max(cloud, companion);
  }
  return cloud;
}

void main() {
  if (uSourceReady < 0.5) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 position = compositionPosition();
  float flattening = 1.0 - clamp(uFlattening, 0.0, 0.12);
  vec3 rayOrigin = vec3(position.x, position.y / flattening, CAMERA_DISTANCE);
  vec3 rayDirection = vec3(0.0, 0.0, -1.0);
  vec3 viewDirection = -rayDirection;
  vec3 scaledLightDirection = normalize(vec3(
    uSunDirection.x,
    uSunDirection.y / flattening,
    uSunDirection.z
  ));
  vec2 shellHit = raySphere(rayOrigin, rayDirection, HAZE_RADIUS);
  if (shellHit.x < 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  float shellDistance = length(vec2(position.x, position.y / flattening)) / HAZE_RADIUS;
  float shellEdge = max(fwidth(shellDistance), 0.0005);
  float shellCoverage = 1.0 - smoothstep(1.0 - shellEdge, 1.0 + shellEdge, shellDistance);
  vec2 bodyHit = raySphere(rayOrigin, rayDirection, BODY_RADIUS);
  bool hitsBody = bodyHit.x > 0.0;
  if (!hitsBody) {
    fragColor = vec4(0.0);
    return;
  }
  float hazeStart = max(shellHit.x, 0.0);
  float hazeEnd = bodyHit.x;
  vec4 haze = integrateUpperHaze(
    rayOrigin,
    rayDirection,
    hazeStart,
    hazeEnd,
    scaledLightDirection,
    viewDirection
  );
  float hazeAlpha = 1.0 - exp(-haze.a);
  vec3 hazeStraight = hazeAlpha > 0.0001 ? haze.rgb / hazeAlpha : vec3(0.0);
  vec3 straightColor = hazeStraight;
  float bodyCoverage = 0.0;

  {
    float bodyDistance = length(vec2(position.x, position.y / flattening)) / BODY_RADIUS;
    float bodyEdge = max(fwidth(bodyDistance), 0.0005);
    bodyCoverage = 1.0 - smoothstep(1.0 - bodyEdge, 1.0 + bodyEdge, bodyDistance);
    vec3 scaledPoint = rayOrigin + rayDirection * bodyHit.x;
    vec3 radialDirection = normalize(scaledPoint);
    vec3 geometricNormal = normalize(vec3(
      scaledPoint.x,
      scaledPoint.y / flattening,
      scaledPoint.z
    ));
    vec3 mappedDirection = orientedDirection(radialDirection);
    vec3 weatherDirection = advectedDirection(mappedDirection);
    float opticalDepth = sampleEquirectangular(uOpticalDepthTexture, mappedDirection);
    float flow = movingCloudDetail(weatherDirection);
    float longitude = atan(mappedDirection.x, mappedDirection.z);
    float latitude = asin(clamp(mappedDirection.y, -1.0, 1.0));
    vec2 localVortex = vortexMetric(longitude, latitude);
    float vortexRadius = length(localVortex);
    float vortex = vortexInfluence(longitude, latitude);
    float vortexCollar = uVortexCirculation > 0.0001
      ? exp(-pow((vortexRadius - 1.12) / 0.16, 2.0)) * uVortexCirculation
      : 0.0;
    float collarFilament = sin(atan(localVortex.y, localVortex.x) * 3.0 - uTime * 0.08) *
      vortexCollar * 0.026;
    float deckStructure = (opticalDepth - 0.5) * 0.58 + flow +
      vortexCollar * 0.045 + collarFilament;
    float vortexReflectivity = 1.0 - vortex * uVortexDarkness * 0.85;

    float viewCosine = max(dot(geometricNormal, viewDirection), 0.0);
    float incident = dot(geometricNormal, uSunDirection);
    float incidentCosine = max(incident, 0.0);
    float dayVisibility = smoothstep(-0.1, 0.065, incident);
    float deepPath = max(opticalDepth + deckStructure * 0.22, 0.08);
    vec3 viewTransmittance = methaneTransmittance(deepPath / max(viewCosine, 0.12));
    vec3 sunTransmittance = incident > 0.0
      ? methaneTransmittance(deepPath / max(incidentCosine, 0.12))
      : vec3(0.0);
    vec3 neutralDeck = vec3(0.36, 0.44, 0.49);
    vec3 methaneScatter = mix(
      neutralDeck,
      vec3(0.18, 0.45, 0.58),
      clamp(uMethaneAbsorption * uDeepOpticalDepth * 0.7, 0.0, 1.0)
    );
    float lommelSeeliger = min(
      (2.0 * incidentCosine) / max(incidentCosine + viewCosine, 0.0001),
      1.28
    );
    float broadMultipleScatter = pow(incidentCosine, 0.48);
    float reflected = mix(broadMultipleScatter, lommelSeeliger, 0.28);
    vec3 direct = neutralDeck * sunTransmittance * reflected;
    vec3 multiple = methaneScatter * broadMultipleScatter * 0.62;
    vec3 bodyColor = direct * viewTransmittance +
      multiple * mix(vec3(0.72), viewTransmittance, 0.28);
    bodyColor *= (1.0 + deckStructure) * vortexReflectivity;
    bodyColor = mix(vec3(0.0002, 0.0005, 0.0008), bodyColor, dayVisibility);

    if (uUpperClouds > 0.0001) {
      float cloud = highCloudCoverage(radialDirection) * uUpperClouds;
      float cloudShadow = 0.0;
      float reliefLight = 0.0;
      if (uCloudRelief > 0.0001) {
        vec3 tangentLight = scaledLightDirection -
          radialDirection * dot(scaledLightDirection, radialDirection);
        float tangentLength = length(tangentLight);
        if (tangentLength > 0.0001) {
          tangentLight /= tangentLength;
          float offset = uCloudRelief * 0.018;
          float sunwardCloud = highCloudCoverage(normalize(radialDirection + tangentLight * offset));
          float leewardCloud = highCloudCoverage(normalize(radialDirection - tangentLight * offset));
          float directionalGradient = (sunwardCloud - leewardCloud) * uUpperClouds;
          cloudShadow = max(sunwardCloud * uUpperClouds - cloud, 0.0) * uCloudRelief;
          reliefLight = max(directionalGradient, 0.0) * uCloudRelief;
        }
      }
      bodyColor *= 1.0 - cloudShadow * dayVisibility * 0.28;
      vec3 cloudColor = vec3(0.82, 0.91, 0.92) *
        (0.42 + incidentCosine * 0.78 + reliefLight * 0.4);
      bodyColor = mix(bodyColor, cloudColor, cloud * dayVisibility * 0.9);
    }

    bodyColor = bodyColor * exp(-haze.a) + haze.rgb;
    straightColor = mix(hazeStraight, bodyColor, bodyCoverage);
  }

  straightColor = filmic(straightColor * uExposure);
  straightColor = pow(straightColor, vec3(1.0 / 2.2));
  if (uExposure > 0.0001) {
    float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    straightColor = clamp(straightColor + dither, 0.0, 1.0);
  }
  float alpha = mix(hazeAlpha, 1.0, bodyCoverage) * shellCoverage;
  fragColor = vec4(straightColor * alpha, alpha);
}
`

/**
 * Single-channel R8 texture with a 1×1 placeholder. The shared `createTexture`
 * always uploads RGBA, which WebGL2 rejects for an R8 internal format.
 */
function createDataTexture(
  gl: WebGL2RenderingContext,
  label: string,
  wrapLongitude: boolean,
): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error(`Unable to create ${label} texture`)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([128]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapLongitude ? gl.REPEAT : gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return texture
}

function validateDataPlane(plane: NeptunianDataPlane): void {
  if (plane.width < 1 || plane.height < 1 || plane.data.length !== plane.width * plane.height) {
    throw new Error('Invalid Neptunian data plane')
  }
}

/** Upload a single-channel plane. Caller owns unpack state. */
function uploadDataPlane(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  plane: NeptunianDataPlane,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    plane.width,
    plane.height,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    plane.data,
  )
  gl.generateMipmap(gl.TEXTURE_2D)
}

const spec: OrbRendererSpec<NeptunianResources, NeptunianFrameSettings, NeptunianSurface> = {
  label: 'Neptune',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Neptune')
    return {
      highCloudTexture: createDataTexture(gl, 'Neptune high cloud', true),
      opticalDepthTexture: createDataTexture(gl, 'Neptune optical depth', true),
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Neptune'),
      vortexCenter: [0, 0],
      vortexRadii: [0, 0],
      zonalWindTexture: createDataTexture(gl, 'Neptune zonal wind', false),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteTexture(resources.highCloudTexture)
    gl.deleteTexture(resources.opticalDepthTexture)
    gl.deleteTexture(resources.zonalWindTexture)
    gl.deleteProgram(resources.program)
    gl.deleteVertexArray(resources.vertexArray)
  },
  upload(gl, resources, surface) {
    validateDataPlane(surface.opticalDepth)
    validateDataPlane(surface.highClouds)
    validateDataPlane(surface.zonalWind)
    // Single-channel rows are not 4-byte aligned for arbitrary widths.
    withUnpackState(gl, { alignment: 1, flipY: false, premultiplyAlpha: false }, () => {
      uploadDataPlane(gl, resources.opticalDepthTexture, surface.opticalDepth)
      uploadDataPlane(gl, resources.highCloudTexture, surface.highClouds)
      uploadDataPlane(gl, resources.zonalWindTexture, surface.zonalWind)
    })
    const { vortex } = surface
    resources.vortexCenter = vortex
      ? [degreesToRadians(vortex.longitudeDegrees), degreesToRadians(vortex.latitudeDegrees)]
      : [0, 0]
    resources.vortexRadii = vortex
      ? [
          degreesToRadians(vortex.angularRadiiDegrees[0]),
          degreesToRadians(vortex.angularRadiiDegrees[1]),
        ]
      : [0, 0]
  },
  isAnimated(settings) {
    return settings.spin !== 0 || settings.windScale > 0 || settings.vortexCirculation > 0
  },
  render(gl, resources, frame) {
    const { composition, elapsed, hasSource, pointerX, pointerY, settings } = frame
    const { uniforms } = resources

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.opticalDepthTexture)
    gl.uniform1i(uniforms.uOpticalDepthTexture, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, resources.highCloudTexture)
    gl.uniform1i(uniforms.uHighCloudTexture, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, resources.zonalWindTexture)
    gl.uniform1i(uniforms.uZonalWindTexture, 2)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uWeatherTilt, degreesToRadians(settings.tilt))
    gl.uniform1f(uniforms.uCloudRelief, settings.cloudRelief)
    gl.uniform1f(uniforms.uCompanionCloud, settings.companionCloud)
    gl.uniform1f(uniforms.uDeepOpticalDepth, settings.deepOpticalDepth)
    gl.uniform1f(uniforms.uExposure, settings.exposure)
    gl.uniform1f(uniforms.uFlowDetail, settings.flowDetail)
    gl.uniform1f(uniforms.uForwardScattering, settings.forwardScattering)
    gl.uniform1f(uniforms.uHazeOpticalDepth, settings.hazeOpticalDepth)
    gl.uniform1f(uniforms.uMethaneAbsorption, settings.methaneAbsorption)
    gl.uniform1f(uniforms.uFlattening, settings.flattening / 100)
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform3f(
      uniforms.uSunDirection,
      ...sunDirection(settings.sunAzimuth, settings.sunElevation),
    )
    gl.uniform1f(uniforms.uYaw, degreesToRadians(settings.yaw + elapsed * settings.spin))
    gl.uniform1f(uniforms.uTime, elapsed)
    gl.uniform1f(uniforms.uUpperClouds, settings.upperClouds)
    gl.uniform1f(uniforms.uUpperHaze, settings.upperHaze)
    gl.uniform2f(uniforms.uVortexCenter, ...resources.vortexCenter)
    gl.uniform1f(uniforms.uVortexCirculation, settings.vortexCirculation)
    gl.uniform1f(uniforms.uVortexDarkness, settings.vortexDarkness)
    gl.uniform2f(uniforms.uVortexRadii, ...resources.vortexRadii)
    gl.uniform1f(uniforms.uWindScale, settings.windScale)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function NeptunianOrbEffect({
  className,
  cloudRelief = 1,
  companionCloud = 0.68,
  composition,
  deepOpticalDepth = 0.72,
  exposure = 0.72,
  flattening = 1.7,
  flowDetail = 0.34,
  forwardScattering = 0.28,
  hazeOpticalDepth = 0.48,
  lean = true,
  methaneAbsorption = 0.78,
  onError,
  paused,
  source,
  spin = 1.3,
  style,
  sunAzimuth = -10,
  sunElevation = 5,
  tilt = 18,
  upperClouds = 0.68,
  upperHaze = 0.3,
  viewport,
  vortexCirculation = 0.48,
  vortexDarkness = 0.5,
  windScale = 0.62,
  yaw = 0,
}: NeptunianOrbEffectProps) {
  const settings: NeptunianFrameSettings = {
    cloudRelief,
    companionCloud,
    deepOpticalDepth,
    exposure,
    flattening,
    flowDetail,
    forwardScattering,
    hazeOpticalDepth,
    lean,
    methaneAbsorption,
    spin,
    sunAzimuth,
    sunElevation,
    tilt,
    upperClouds,
    upperHaze,
    vortexCirculation,
    vortexDarkness,
    windScale,
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
