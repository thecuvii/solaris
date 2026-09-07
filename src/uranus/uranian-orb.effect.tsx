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
  withUnpackState,
} from '../internal/webgl'
import type { OrbCanvasProps, OrbLightingProps, OrbPoseProps } from '../orb'

export type UranianDataPlane = {
  data: Uint8Array
  height: number
  width: number
}

export type UranianSurface = {
  /** 1024×512 RGBA equirectangular plane: R aerosol, G clouds, B methane depletion, A hood mask. */
  atmosphere: UranianDataPlane
}

export type UranianOrbSource = OrbSource<UranianSurface>

export type UranianOrbEffectProps = OrbCanvasProps &
  Omit<OrbPoseProps, 'tilt'> &
  OrbLightingProps & {
    /** Aerosol haze load in the upper troposphere. Range 0–1.5. @default 0.72 */
    aerosolDepth?: number
    /** Thickness of the forward-scattering haze shell in planet radii. Range 0–0.08. @default 0.025 */
    atmosphereThickness?: number
    /** Contrast of the zonal bands. Range 0–0.5. @default 0.13 */
    bandContrast?: number
    /** Contrast of discrete bright clouds. Range 0–0.5. @default 0.08 */
    cloudContrast?: number
    /** Eccentricity of the outer ε ring. Range 0–0.02. @default 0.008 */
    discStretch?: number
    /** Linear scene gain before tone mapping. Range 0–2. @default 0.86 */
    exposure?: number
    /** Polar flattening in percent. Range 0–8. @default 2.3 */
    flattening?: number
    /** Forward-scatter haze brightening along the limb. Range 0–1. @default 0.15 */
    forwardScattering?: number
    /** Opacity of the forward-scattering haze shell. Range 0–1. @default 0.34 */
    hazeDensity?: number
    /** Latitude where the polar hood begins, in degrees. Range 25–75. @default 45 */
    hoodLatitude?: number
    /** Width of the polar hood boundary in degrees. Range 2–25. @default 10 */
    hoodSoftness?: number
    /** Minnaert limb-darkening exponent. Range 0.55–1.2. @default 0.72 */
    limbDarkening?: number
    /** Methane absorption strength; shifts the disc towards cyan. Range 0–1.5. @default 0.58 */
    methaneAbsorption?: number
    /** Place the polar hood over the north pole instead of the south. @default true */
    northHood?: boolean
    /** Ambient fill on the night side. Range 0–0.35. @default 0.08 */
    phaseFill?: number
    /** Brightness of the polar hood. Range 0–1. @default 0.26 */
    polarHood?: number
    /** Rotation of the pole around the view axis in degrees. @default -26 */
    poleAzimuth?: number
    /** Tip of the pole towards the viewer in degrees. @default 38 */
    poleElevation?: number
    /** Ring shadow on the disc and disc shadow on the rings. Range 0–1. @default 0.75 */
    ringShadow?: number
    /** Ring opacity gain above the physical value. Range 0–6. @default 4.5 */
    ringVisibility?: number
    source: UranianOrbSource
    /** Periapsis angle of the ε ring eccentricity in degrees. @default 0 */
    stretchAngle?: number
    /** Differential zonal wind speed relative to `spin`. Range 0–1. @default 0.2 */
    windScale?: number
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAerosolDepth',
  'uAtmosphereTexture',
  'uAtmosphereThickness',
  'uBandContrast',
  'uCloudContrast',
  'uDiscStretch',
  'uExposure',
  'uFlattening',
  'uForwardScattering',
  'uHazeDensity',
  'uHoodLatitude',
  'uHoodPole',
  'uHoodSoftness',
  'uLimbDarkening',
  'uMethaneAbsorption',
  'uPhaseFill',
  'uPolarHood',
  'uPoleAzimuth',
  'uPoleElevation',
  'uRingShadow',
  'uRingVisibility',
  'uSourceReady',
  'uSpin',
  'uStretchAngle',
  'uSunDirectionView',
  'uTime',
  'uWindScale',
  'uYaw',
] as const

type UranianResources = {
  atmosphereTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

type UranianFrameSettings = {
  aerosolDepth: number
  atmosphereThickness: number
  bandContrast: number
  cloudContrast: number
  discStretch: number
  exposure: number
  flattening: number
  forwardScattering: number
  hazeDensity: number
  hoodLatitude: number
  hoodSoftness: number
  lean: boolean
  limbDarkening: number
  methaneAbsorption: number
  northHood: boolean
  phaseFill: number
  polarHood: number
  poleAzimuth: number
  poleElevation: number
  ringShadow: number
  ringVisibility: number
  spin: number
  stretchAngle: number
  sunAzimuth: number
  sunElevation: number
  windScale: number
  yaw: number
}

const URANUS_RADIUS = 0.38
const ATMOSPHERE_WIDTH = 1024
const ATMOSPHERE_HEIGHT = 512
/** Pointer lean nudges the pole direction by up to this many degrees. */
const LEAN_AZIMUTH_DEGREES = 6
const LEAN_ELEVATION_DEGREES = 4

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform float uAerosolDepth;
uniform sampler2D uAtmosphereTexture;
uniform float uAtmosphereThickness;
uniform float uBandContrast;
uniform float uCloudContrast;
uniform float uDiscStretch;
uniform float uStretchAngle;
uniform float uExposure;
uniform float uForwardScattering;
uniform float uHazeDensity;
uniform float uHoodLatitude;
uniform float uHoodPole;
uniform float uHoodSoftness;
uniform float uLimbDarkening;
uniform float uMethaneAbsorption;
uniform float uFlattening;
uniform float uPhaseFill;
uniform float uPolarHood;
uniform float uPoleAzimuth;
uniform float uPoleElevation;
uniform float uRingShadow;
uniform float uRingVisibility;
uniform float uSpin;
uniform float uSourceReady;
uniform vec3 uSunDirectionView;
uniform float uYaw;
uniform float uTime;
uniform float uWindScale;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float CAMERA_DISTANCE = 3.0;
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float URANUS_RADIUS = ${URANUS_RADIUS.toFixed(2)};
const int RING_COUNT = 10;
const float RING_RADIUS[RING_COUNT] = float[](
  1.6369185023,
  1.6524120662,
  1.6655972456,
  1.7495989671,
  1.7864939943,
  1.8457686138,
  1.8634140616,
  1.8897452952,
  1.9571970734,
  2.0012128800
);
const float RING_WIDTH[RING_COUNT] = float[](
  0.0000598615,
  0.0000892054,
  0.0000911616,
  0.0003309989,
  0.0003712978,
  0.0000626003,
  0.0000841191,
  0.0001799757,
  0.0000899879,
  0.0022731719
);
const float RING_OPTICAL_DEPTH[RING_COUNT] = float[](
  0.3,
  0.5,
  0.3,
  0.4,
  0.3,
  0.4,
  0.3,
  0.5,
  0.1,
  0.5
);
const float RING_ECCENTRICITY[RING_COUNT] = float[](
  0.00102,
  0.00190,
  0.00106,
  0.00076,
  0.000442,
  0.0,
  0.001092,
  0.0,
  0.0,
  0.00794
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

vec3 rotateZ(vec3 value, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec3(cosine * value.x - sine * value.y, sine * value.x + cosine * value.y, value.z);
}

vec3 viewToBody(vec3 value) {
  return rotateX(rotateZ(value, uPoleAzimuth), -uPoleElevation);
}

float ringRadiusFromOrigin(vec3 origin, vec3 direction) {
  float safeDirectionY = direction.y < 0.0 ?
    min(direction.y, -0.00001) : max(direction.y, 0.00001);
  float distance = -origin.y / safeDirectionY;
  vec3 point = origin + direction * distance;
  return length(point.xz) / URANUS_RADIUS;
}

vec4 rayEllipsoid(vec3 origin, vec3 direction, vec3 radii) {
  vec3 inverseRadiiSquared = 1.0 / (radii * radii);
  float a = dot(direction * direction, inverseRadiiSquared);
  float b = 2.0 * dot(origin * direction, inverseRadiiSquared);
  float c = dot(origin * origin, inverseRadiiSquared) - 1.0;
  float discriminant = b * b - 4.0 * a * c;
  float edgeWidth = max(fwidth(discriminant) * 1.1, 0.000001);
  float coverage = smoothstep(-edgeWidth, edgeWidth, discriminant);
  if (discriminant < -edgeWidth) return vec4(-1.0, -1.0, 0.0, discriminant);
  float root = sqrt(max(discriminant, 0.0));
  float nearHit = (-b - root) / (2.0 * a);
  float farHit = (-b + root) / (2.0 * a);
  if (farHit <= 0.0001) return vec4(-1.0, -1.0, 0.0, discriminant);
  return vec4(nearHit > 0.0001 ? nearHit : farHit, farHit, coverage, discriminant);
}

vec2 sphereUv(vec3 direction) {
  float longitude = atan(direction.x, direction.z) / TAU + 0.5;
  float latitude = asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5;
  return vec2(
    fract(longitude + 0.5 / 1024.0),
    (clamp(latitude, 0.0, 1.0) * 511.0 + 0.5) / 512.0
  );
}

void atmosphereCoordinates(vec3 direction, out vec2 uv, out vec2 dx, out vec2 dy) {
  uv = sphereUv(direction);
  vec3 dxDirection = normalize(direction + dFdx(direction));
  vec3 dyDirection = normalize(direction + dFdy(direction));
  dx = sphereUv(dxDirection) - uv;
  dy = sphereUv(dyDirection) - uv;
  dx.x -= round(dx.x);
  dy.x -= round(dy.x);
}

vec4 sampleAtmosphere(vec2 uv, vec2 dx, vec2 dy) {
  return textureGrad(uAtmosphereTexture, uv, dx, dy);
}

float ringCenter(int index, float angle) {
  float eccentricity = index == 9 ? uDiscStretch : RING_ECCENTRICITY[index];
  float periapsis = index == 9 ? uStretchAngle : 0.0;
  return RING_RADIUS[index] * (1.0 - eccentricity * eccentricity) /
    max(1.0 + eccentricity * cos(angle - periapsis), 0.0001);
}

vec2 integrateRings(float radius, float angle, float halfFootprint, float opening) {
  float transmission = 1.0;
  float weightedTone = 0.0;
  float totalLayer = 0.0;

  for (int index = 0; index < RING_COUNT; index += 1) {
    float center = ringCenter(index, angle);
    float halfWidth = 0.5 * RING_WIDTH[index];
    float overlap = max(
      0.0,
      min(radius + halfFootprint, center + halfWidth) -
        max(radius - halfFootprint, center - halfWidth)
    );
    float coverage = clamp(overlap / max(2.0 * halfFootprint, 0.000001), 0.0, 1.0);
    float layer = coverage * (1.0 - exp(-RING_OPTICAL_DEPTH[index] / opening));
    transmission *= 1.0 - layer;
    weightedTone += layer * float(index) / float(RING_COUNT - 1);
    totalLayer += layer;
  }

  return vec2(1.0 - transmission, totalLayer > 0.0 ? weightedTone / totalLayer : 0.0);
}

float ringDisplayOpacity(float physicalAlpha) {
  float gain = clamp(uRingVisibility, 0.0, 6.0);
  if (gain <= 0.0) return 0.0;
  return 1.0 - pow(1.0 - clamp(physicalAlpha, 0.0, 1.0), gain);
}

float bodyOcclusionOnRing(vec3 point, vec3 lightDirection, vec3 radii) {
  vec3 origin = point + lightDirection * 0.0001;
  vec3 inverseRadiiSquared = 1.0 / (radii * radii);
  float a = dot(lightDirection * lightDirection, inverseRadiiSquared);
  float b = 2.0 * dot(origin * lightDirection, inverseRadiiSquared);
  float c = dot(origin * origin, inverseRadiiSquared) - 1.0;
  float discriminant = b * b - 4.0 * a * c;
  float edgeWidth = max(fwidth(discriminant), 0.000001);
  float farHit = (-b + sqrt(max(discriminant, 0.0))) / (2.0 * a);
  float positiveHit = step(b, -0.000001) * step(0.0001, farHit);
  return smoothstep(-edgeWidth, edgeWidth, discriminant) * positiveHit;
}

float ringOcclusionOnBody(
  float radius,
  float angle,
  float halfFootprint,
  float distance,
  float lightY
) {
  float solarOpening = max(abs(lightY), 0.015);
  float valid = step(0.00001, abs(lightY)) *
    step(0.0001, distance) *
    step(1.60, radius + halfFootprint) *
    step(radius - halfFootprint, 2.045);
  float physicalAlpha = integrateRings(radius, angle, halfFootprint, solarOpening).x;
  return ringDisplayOpacity(physicalAlpha) * valid;
}

vec4 shadeBody(
  vec3 point,
  vec3 rayDirection,
  vec3 lightDirection,
  vec3 radii,
  float coverage,
  vec4 atmosphere,
  float ringOcclusion
) {
  vec3 normal = normalize(point / (radii * radii));
  vec3 viewDirection = -rayDirection;
  float viewCosine = max(dot(normal, viewDirection), 0.02);
  float incident = dot(normal, lightDirection);
  float incidentCosine = max(incident, 0.0);
  float minnaert = step(0.0, incident) *
    pow(incidentCosine, uLimbDarkening) *
    pow(viewCosine, uLimbDarkening - 1.0);
  minnaert *= pow(viewCosine, 1.25);
  float fill = uPhaseFill * max(viewCosine, 0.0) * smoothstep(-0.25, 0.15, incident);
  minnaert *= 1.0 - uRingShadow * ringOcclusion;

  vec3 radialDirection = normalize(point / radii);
  float latitude = asin(clamp(radialDirection.y, -1.0, 1.0));

  float selectedLatitude = latitude * uHoodPole;
  float hoodBoundary = uHoodLatitude;
  float hood = atmosphere.a * smoothstep(
    hoodBoundary - uHoodSoftness,
    hoodBoundary + uHoodSoftness,
    selectedLatitude
  ) * uPolarHood;
  float depletion = atmosphere.b * (0.72 + hood * 0.28);
  float methane = max(uMethaneAbsorption * (1.0 - depletion * 0.3), 0.0);
  vec3 color = vec3(0.55, 0.78, 0.90);
  color *= vec3(exp(-methane * 0.48), exp(-methane * 0.14), exp(-methane * 0.025));

  float aerosolVariation = (atmosphere.r - 0.5) * 2.0;
  float aerosol = clamp(uAerosolDepth * (0.58 + atmosphere.r * 0.42 + hood * 0.22), 0.0, 1.8);
  color = mix(color, vec3(0.58, 0.78, 0.84), clamp(aerosol * 0.18, 0.0, 0.4));
  color *= 1.0 + aerosolVariation * uBandContrast * 2.5;
  color += vec3(0.42, 0.56, 0.64) * atmosphere.g * uCloudContrast;
  color = mix(color, vec3(0.68, 0.84, 0.86), clamp(hood * 0.65, 0.0, 0.58));

  return vec4(color * (minnaert + fill), coverage);
}

vec4 shadeRing(
  float radius,
  float angle,
  float halfFootprint,
  vec3 rayDirection,
  vec3 lightDirection,
  float bodyOcclusion
) {
  float viewOpening = max(abs(rayDirection.y), 0.015);
  vec2 integrated = integrateRings(radius, angle, halfFootprint, viewOpening);
  float alpha = ringDisplayOpacity(integrated.x);

  float solarOpening = max(abs(lightDirection.y), 0.015);
  float opposition = 0.88 + 0.18 * pow(max(dot(lightDirection, -rayDirection), 0.0), 6.0);
  float direct = solarOpening / (solarOpening + viewOpening);
  direct *= 1.0 - uRingShadow * bodyOcclusion;
  vec3 warmCarbon = mix(vec3(0.24, 0.21, 0.17), vec3(0.34, 0.29, 0.22), integrated.y);
  return vec4(warmCarbon * direct * opposition * uRingVisibility, alpha);
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
  vec3 rayOrigin = viewToBody(vec3(position, CAMERA_DISTANCE));
  vec3 rayDirection = normalize(viewToBody(vec3(0.0, 0.0, -1.0)));
  vec3 lightDirection = normalize(viewToBody(uSunDirectionView));
  vec3 radii = vec3(
    URANUS_RADIUS,
    URANUS_RADIUS * (1.0 - uFlattening),
    URANUS_RADIUS
  );

  vec4 bodyHit = rayEllipsoid(rayOrigin, rayDirection, radii);
  bool hasBody = bodyHit.x > 0.0 && bodyHit.z > 0.0;
  bool hasExactBody = bodyHit.x > 0.0 && bodyHit.w >= 0.0;
  vec3 bodyPoint = rayOrigin + rayDirection * max(bodyHit.x, 0.0);
  vec3 bodyRadialDirection = normalize(bodyPoint / radii);
  float bodyLatitude = asin(clamp(bodyRadialDirection.y, -1.0, 1.0));
  float bodyWind = sin(bodyLatitude * 2.0) * cos(bodyLatitude * 5.0);
  float bodyLongitude =
    uYaw + uTime * uSpin * uWindScale * bodyWind * 0.25;
  vec3 mappedBodyDirection = rotateY(bodyRadialDirection, bodyLongitude);
  vec2 atmosphereUv;
  vec2 atmosphereDx;
  vec2 atmosphereDy;
  atmosphereCoordinates(mappedBodyDirection, atmosphereUv, atmosphereDx, atmosphereDy);

  float safeLightY = lightDirection.y < 0.0 ?
    min(lightDirection.y, -0.00001) : max(lightDirection.y, 0.00001);
  float bodyRingDistance = -bodyPoint.y / safeLightY;
  vec3 bodyRingPoint = bodyPoint + lightDirection * bodyRingDistance;
  float bodyRingRadius = length(bodyRingPoint.xz) / URANUS_RADIUS;
  float bodyRingAngle = atan(bodyRingPoint.x, bodyRingPoint.z);
  float bodyRingHalfFootprint = max(0.5 * fwidth(bodyRingRadius), 0.000001);

  vec4 bodyLayer = vec4(0.0);
  if (hasBody) {
    vec4 atmosphere = sampleAtmosphere(atmosphereUv, atmosphereDx, atmosphereDy);
    float bodyRingOcclusion = ringOcclusionOnBody(
      bodyRingRadius,
      bodyRingAngle,
      bodyRingHalfFootprint,
      bodyRingDistance,
      lightDirection.y
    );
    bodyLayer = shadeBody(
      bodyPoint,
      rayDirection,
      lightDirection,
      radii,
      bodyHit.z,
      atmosphere,
      bodyRingOcclusion
    );
  }

  float safeRayY = rayDirection.y < 0.0 ?
    min(rayDirection.y, -0.00001) : max(rayDirection.y, 0.00001);
  float ringDistance = -rayOrigin.y / safeRayY;
  vec3 ringPoint = rayOrigin + rayDirection * ringDistance;
  float ringRadius = length(ringPoint.xz) / URANUS_RADIUS;
  float halfPixel = 1.0 / uCompositionScale;
  vec3 halfPixelX = viewToBody(vec3(halfPixel, 0.0, 0.0));
  vec3 halfPixelY = viewToBody(vec3(0.0, halfPixel, 0.0));
  float ringHalfFootprint = max(
    0.5 * (
      abs(
        ringRadiusFromOrigin(rayOrigin + halfPixelX, rayDirection) -
        ringRadiusFromOrigin(rayOrigin - halfPixelX, rayDirection)
      ) +
      abs(
        ringRadiusFromOrigin(rayOrigin + halfPixelY, rayDirection) -
        ringRadiusFromOrigin(rayOrigin - halfPixelY, rayDirection)
      )
    ),
    0.000001
  );
  float ringBodyOcclusion = bodyOcclusionOnRing(ringPoint, lightDirection, radii);
  bool inAnnulus =
    abs(rayDirection.y) > 0.00001 &&
    ringDistance > 0.0 &&
    ringRadius + ringHalfFootprint >= 1.60 &&
    ringRadius - ringHalfFootprint <= 2.045;
  bool visibleInDepth = !hasExactBody || ringDistance < bodyHit.x;
  vec4 ringLayer = vec4(0.0);
  if (inAnnulus && visibleInDepth) {
    ringLayer = shadeRing(
      ringRadius,
      atan(ringPoint.x, ringPoint.z),
      ringHalfFootprint,
      rayDirection,
      lightDirection,
      ringBodyOcclusion
    );
  }

  vec3 linearPremultiplied = bodyLayer.rgb * bodyLayer.a;
  float alpha = bodyLayer.a;
  if (ringLayer.a > 0.0) {
    linearPremultiplied = ringLayer.rgb * ringLayer.a + linearPremultiplied * (1.0 - ringLayer.a);
    alpha = ringLayer.a + alpha * (1.0 - ringLayer.a);
  }

  if (
    uAtmosphereThickness > 0.0 &&
    uHazeDensity > 0.0 &&
    uForwardScattering > 0.0
  ) {
    vec3 shellRadii = radii + vec3(uAtmosphereThickness);
    vec4 shellHit = rayEllipsoid(rayOrigin, rayDirection, shellRadii);
    float shellOnly = max(shellHit.z - bodyHit.z, 0.0);
    float shellPath = max(shellHit.y - shellHit.x, 0.0) /
      max(uAtmosphereThickness * 6.0, 0.0001);
    float forwardLobe = pow(max(-dot(-rayDirection, lightDirection), 0.0), 8.0);
    float hazeAlpha = clamp(
      shellOnly * shellPath * uHazeDensity * uForwardScattering * forwardLobe,
      0.0,
      0.72
    );
    vec3 hazeColor = vec3(0.48, 0.75, 0.79) * hazeAlpha;
    linearPremultiplied = hazeColor + linearPremultiplied * (1.0 - hazeAlpha);
    alpha = hazeAlpha + alpha * (1.0 - hazeAlpha);
  }

  if (alpha <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 straightColor = linearPremultiplied / alpha;
  straightColor = filmic(straightColor * uExposure);
  straightColor = pow(straightColor, vec3(1.0 / 2.2));
  if (uExposure > 0.0) {
    float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    straightColor = clamp(straightColor + dither, 0.0, 1.0);
  }
  fragColor = vec4(straightColor * alpha, alpha);
}
`

function validateAtmosphere(plane: UranianDataPlane): void {
  if (
    plane.width !== ATMOSPHERE_WIDTH ||
    plane.height !== ATMOSPHERE_HEIGHT ||
    plane.data.length !== plane.width * plane.height * 4
  ) {
    throw new Error('Invalid Uranian atmosphere data plane')
  }
}

/** Upload the RGBA atmosphere plane. Caller owns unpack state. */
function uploadAtmosphere(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  plane: UranianDataPlane,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    plane.width,
    plane.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    plane.data,
  )
  gl.generateMipmap(gl.TEXTURE_2D)
}

/**
 * View-space sun direction. Uranus keeps its own axis convention (Y forward,
 * Z up) so the shader's `viewToBody` can reuse it unchanged.
 */
function viewSunDirection(
  azimuthDegrees: number,
  elevationDegrees: number,
): readonly [number, number, number] {
  const azimuth = degreesToRadians(azimuthDegrees)
  const elevation = degreesToRadians(elevationDegrees)
  const elevationCosine = Math.cos(elevation)
  return [
    Math.sin(azimuth) * elevationCosine,
    Math.cos(azimuth) * elevationCosine,
    Math.sin(elevation),
  ]
}

const spec: OrbRendererSpec<UranianResources, UranianFrameSettings, UranianSurface> = {
  label: 'Uranus',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Uranus')
    return {
      atmosphereTexture: createTexture(gl, 'Uranus atmosphere', { placeholder: [128, 0, 0, 0] }),
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Uranus'),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteTexture(resources.atmosphereTexture)
    gl.deleteProgram(resources.program)
    gl.deleteVertexArray(resources.vertexArray)
  },
  upload(gl, resources, surface) {
    validateAtmosphere(surface.atmosphere)
    // Single-channel rows are not 4-byte aligned for arbitrary widths.
    withUnpackState(gl, { alignment: 1, flipY: false, premultiplyAlpha: false }, () => {
      uploadAtmosphere(gl, resources.atmosphereTexture, surface.atmosphere)
    })
  },
  isAnimated(settings) {
    return settings.spin !== 0
  },
  render(gl, resources, frame) {
    const { composition, elapsed, hasSource, pointerX, pointerY, settings } = frame
    const { uniforms } = resources
    const spin = clamp(settings.spin, -2.9, 2.9)
    // The shader has no pointer uniform; lean tips the pole instead.
    const poleAzimuth = settings.poleAzimuth + pointerX * LEAN_AZIMUTH_DEGREES
    const poleElevation = settings.poleElevation + pointerY * LEAN_ELEVATION_DEGREES

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.atmosphereTexture)
    gl.uniform1i(uniforms.uAtmosphereTexture, 0)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uAerosolDepth, clamp(settings.aerosolDepth, 0, 1.5))
    gl.uniform1f(uniforms.uAtmosphereThickness, clamp(settings.atmosphereThickness, 0, 0.08))
    gl.uniform1f(uniforms.uBandContrast, clamp(settings.bandContrast, 0, 0.5))
    gl.uniform1f(uniforms.uCloudContrast, clamp(settings.cloudContrast, 0, 0.5))
    gl.uniform1f(uniforms.uDiscStretch, clamp(settings.discStretch, 0, 0.02))
    gl.uniform1f(uniforms.uStretchAngle, degreesToRadians(settings.stretchAngle))
    gl.uniform1f(uniforms.uExposure, clamp(settings.exposure, 0, 2))
    gl.uniform1f(uniforms.uForwardScattering, clamp(settings.forwardScattering, 0, 1))
    gl.uniform1f(uniforms.uHazeDensity, clamp(settings.hazeDensity, 0, 1))
    gl.uniform1f(uniforms.uHoodLatitude, degreesToRadians(clamp(settings.hoodLatitude, 25, 75)))
    gl.uniform1f(uniforms.uHoodPole, settings.northHood ? 1 : -1)
    gl.uniform1f(uniforms.uHoodSoftness, degreesToRadians(clamp(settings.hoodSoftness, 2, 25)))
    gl.uniform1f(uniforms.uLimbDarkening, clamp(settings.limbDarkening, 0.55, 1.2))
    gl.uniform1f(uniforms.uMethaneAbsorption, clamp(settings.methaneAbsorption, 0, 1.5))
    gl.uniform1f(uniforms.uFlattening, clamp(settings.flattening, 0, 8) / 100)
    gl.uniform1f(uniforms.uPhaseFill, clamp(settings.phaseFill, 0, 0.35))
    gl.uniform1f(uniforms.uPolarHood, clamp(settings.polarHood, 0, 1))
    gl.uniform1f(uniforms.uPoleAzimuth, degreesToRadians(poleAzimuth))
    gl.uniform1f(uniforms.uPoleElevation, degreesToRadians(poleElevation))
    gl.uniform1f(uniforms.uRingShadow, clamp(settings.ringShadow, 0, 1))
    gl.uniform1f(uniforms.uRingVisibility, clamp(settings.ringVisibility, 0, 6))
    gl.uniform1f(uniforms.uSpin, degreesToRadians(spin))
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform1f(uniforms.uYaw, degreesToRadians(settings.yaw + elapsed * spin))
    gl.uniform1f(uniforms.uTime, elapsed)
    gl.uniform1f(uniforms.uWindScale, clamp(settings.windScale, 0, 1))
    gl.uniform3f(
      uniforms.uSunDirectionView,
      ...viewSunDirection(settings.sunAzimuth, settings.sunElevation),
    )
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function UranianOrbEffect({
  aerosolDepth = 0.72,
  atmosphereThickness = 0.025,
  bandContrast = 0.13,
  className,
  cloudContrast = 0.08,
  composition,
  discStretch = 0.008,
  exposure = 0.86,
  flattening = 2.3,
  forwardScattering = 0.15,
  hazeDensity = 0.34,
  hoodLatitude = 45,
  hoodSoftness = 10,
  lean = true,
  limbDarkening = 0.72,
  methaneAbsorption = 0.58,
  northHood = true,
  onError,
  paused,
  phaseFill = 0.08,
  polarHood = 0.26,
  poleAzimuth = -26,
  poleElevation = 38,
  ringShadow = 0.75,
  ringVisibility = 4.5,
  source,
  spin = -0.5,
  stretchAngle = 0,
  style,
  sunAzimuth = -28,
  sunElevation = 55,
  viewport,
  windScale = 0.2,
  yaw = 18,
}: UranianOrbEffectProps) {
  const settings: UranianFrameSettings = {
    aerosolDepth,
    atmosphereThickness,
    bandContrast,
    cloudContrast,
    discStretch,
    exposure,
    flattening,
    forwardScattering,
    hazeDensity,
    hoodLatitude,
    hoodSoftness,
    lean,
    limbDarkening,
    methaneAbsorption,
    northHood,
    phaseFill,
    polarHood,
    poleAzimuth,
    poleElevation,
    ringShadow,
    ringVisibility,
    spin,
    stretchAngle,
    sunAzimuth,
    sunElevation,
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
