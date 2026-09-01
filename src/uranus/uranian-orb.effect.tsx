'use client'

// Requires: react

import { useRef, type CSSProperties } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

export type UranianDataPlane = {
  data: Uint8Array
  height: number
  width: number
}

export type UranianOrbFrame = {
  atmosphere: UranianDataPlane
}

export type UranianOrbSource = {
  ready?: () => Promise<void>
  render: () => UranianOrbFrame | null
}

export type UranianOrbEffectProps = {
  aerosolDepth?: number
  atmosphereThickness?: number
  bandContrast?: number
  className?: string
  cloudContrast?: number
  epsilonEccentricity?: number
  epsilonPeriapsis?: number
  exposure?: number
  forwardScattering?: number
  hazeOpacity?: number
  hoodLatitude?: number
  hoodPole?: -1 | 1
  hoodSoftness?: number
  limbDarkening?: number
  methaneAbsorption?: number
  oblateness?: number
  phaseFill?: number
  polarHood?: number
  poleAzimuth?: number
  poleElevation?: number
  ringShadow?: number
  ringVisibility?: number
  /** Display-time rotation in radians per second, not Uranus's physical rotation rate. */
  rotationSpeed?: number
  source: UranianOrbSource
  style?: CSSProperties
  sunAzimuth?: number
  sunElevation?: number
  surfaceRotation?: number
  windScale?: number
}

type UranianUniforms = {
  aerosolDepth: WebGLUniformLocation | null
  atmosphereTexture: WebGLUniformLocation | null
  atmosphereThickness: WebGLUniformLocation | null
  bandContrast: WebGLUniformLocation | null
  cloudContrast: WebGLUniformLocation | null
  epsilonEccentricity: WebGLUniformLocation | null
  epsilonPeriapsis: WebGLUniformLocation | null
  exposure: WebGLUniformLocation | null
  forwardScattering: WebGLUniformLocation | null
  hazeOpacity: WebGLUniformLocation | null
  hoodLatitude: WebGLUniformLocation | null
  hoodPole: WebGLUniformLocation | null
  hoodSoftness: WebGLUniformLocation | null
  limbDarkening: WebGLUniformLocation | null
  methaneAbsorption: WebGLUniformLocation | null
  oblateness: WebGLUniformLocation | null
  phaseFill: WebGLUniformLocation | null
  polarHood: WebGLUniformLocation | null
  poleAzimuth: WebGLUniformLocation | null
  poleElevation: WebGLUniformLocation | null
  resolution: WebGLUniformLocation | null
  ringShadow: WebGLUniformLocation | null
  ringVisibility: WebGLUniformLocation | null
  rotationSpeed: WebGLUniformLocation | null
  sourceReady: WebGLUniformLocation | null
  sunDirectionView: WebGLUniformLocation | null
  surfaceRotation: WebGLUniformLocation | null
  time: WebGLUniformLocation | null
  windScale: WebGLUniformLocation | null
}

type UranianResources = {
  atmosphereTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UranianUniforms
  vertexArray: WebGLVertexArrayObject
}

type UranianFrameSettings = {
  aerosolDepth: number
  atmosphereThickness: number
  bandContrast: number
  cloudContrast: number
  epsilonEccentricity: number
  epsilonPeriapsis: number
  exposure: number
  forwardScattering: number
  hazeOpacity: number
  hoodLatitude: number
  hoodPole: -1 | 1
  hoodSoftness: number
  limbDarkening: number
  methaneAbsorption: number
  oblateness: number
  phaseFill: number
  polarHood: number
  poleAzimuth: number
  poleElevation: number
  ringShadow: number
  ringVisibility: number
  rotationSpeed: number
  sunAzimuth: number
  sunElevation: number
  surfaceRotation: number
  windScale: number
}

const URANUS_RADIUS = 0.38
const ATMOSPHERE_WIDTH = 1024
const ATMOSPHERE_HEIGHT = 512

const VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform float uAerosolDepth;
uniform sampler2D uAtmosphereTexture;
uniform float uAtmosphereThickness;
uniform float uBandContrast;
uniform float uCloudContrast;
uniform float uEpsilonEccentricity;
uniform float uEpsilonPeriapsis;
uniform float uExposure;
uniform float uForwardScattering;
uniform float uHazeOpacity;
uniform float uHoodLatitude;
uniform float uHoodPole;
uniform float uHoodSoftness;
uniform float uLimbDarkening;
uniform float uMethaneAbsorption;
uniform float uOblateness;
uniform float uPhaseFill;
uniform float uPolarHood;
uniform float uPoleAzimuth;
uniform float uPoleElevation;
uniform vec2 uResolution;
uniform float uRingShadow;
uniform float uRingVisibility;
uniform float uRotationSpeed;
uniform float uSourceReady;
uniform vec3 uSunDirectionView;
uniform float uSurfaceRotation;
uniform float uTime;
uniform float uWindScale;

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
  float eccentricity = index == 9 ? uEpsilonEccentricity : RING_ECCENTRICITY[index];
  float periapsis = index == 9 ? uEpsilonPeriapsis : 0.0;
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

  vec2 position = (2.0 * gl_FragCoord.xy - uResolution) / min(uResolution.x, uResolution.y);
  vec3 rayOrigin = viewToBody(vec3(position, CAMERA_DISTANCE));
  vec3 rayDirection = normalize(viewToBody(vec3(0.0, 0.0, -1.0)));
  vec3 lightDirection = normalize(viewToBody(uSunDirectionView));
  vec3 radii = vec3(
    URANUS_RADIUS,
    URANUS_RADIUS * (1.0 - uOblateness),
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
    uSurfaceRotation + uTime * uRotationSpeed * uWindScale * bodyWind * 0.25;
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
  float halfPixel = 1.0 / min(uResolution.x, uResolution.y);
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
    uHazeOpacity > 0.0 &&
    uForwardScattering > 0.0
  ) {
    vec3 shellRadii = radii + vec3(uAtmosphereThickness);
    vec4 shellHit = rayEllipsoid(rayOrigin, rayDirection, shellRadii);
    float shellOnly = max(shellHit.z - bodyHit.z, 0.0);
    float shellPath = max(shellHit.y - shellHit.x, 0.0) /
      max(uAtmosphereThickness * 6.0, 0.0001);
    float forwardLobe = pow(max(-dot(-rayDirection, lightDirection), 0.0), 8.0);
    float hazeAlpha = clamp(
      shellOnly * shellPath * uHazeOpacity * uForwardScattering * forwardLobe,
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

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Uranian shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Uranian shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  let fragmentShader: WebGLShader | null = null
  let program: WebGLProgram | null = null
  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    program = gl.createProgram()
    if (!program) throw new Error('Unable to create Uranian shader program')
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Unknown Uranian shader link error')
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

function createAtmosphereTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Unable to create Uranian atmosphere texture')
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
    new Uint8Array([128, 0, 0, 0]),
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.generateMipmap(gl.TEXTURE_2D)
  return texture
}

function getUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): UranianUniforms {
  return {
    aerosolDepth: gl.getUniformLocation(program, 'uAerosolDepth'),
    atmosphereTexture: gl.getUniformLocation(program, 'uAtmosphereTexture'),
    atmosphereThickness: gl.getUniformLocation(program, 'uAtmosphereThickness'),
    bandContrast: gl.getUniformLocation(program, 'uBandContrast'),
    cloudContrast: gl.getUniformLocation(program, 'uCloudContrast'),
    epsilonEccentricity: gl.getUniformLocation(program, 'uEpsilonEccentricity'),
    epsilonPeriapsis: gl.getUniformLocation(program, 'uEpsilonPeriapsis'),
    exposure: gl.getUniformLocation(program, 'uExposure'),
    forwardScattering: gl.getUniformLocation(program, 'uForwardScattering'),
    hazeOpacity: gl.getUniformLocation(program, 'uHazeOpacity'),
    hoodLatitude: gl.getUniformLocation(program, 'uHoodLatitude'),
    hoodPole: gl.getUniformLocation(program, 'uHoodPole'),
    hoodSoftness: gl.getUniformLocation(program, 'uHoodSoftness'),
    limbDarkening: gl.getUniformLocation(program, 'uLimbDarkening'),
    methaneAbsorption: gl.getUniformLocation(program, 'uMethaneAbsorption'),
    oblateness: gl.getUniformLocation(program, 'uOblateness'),
    phaseFill: gl.getUniformLocation(program, 'uPhaseFill'),
    polarHood: gl.getUniformLocation(program, 'uPolarHood'),
    poleAzimuth: gl.getUniformLocation(program, 'uPoleAzimuth'),
    poleElevation: gl.getUniformLocation(program, 'uPoleElevation'),
    resolution: gl.getUniformLocation(program, 'uResolution'),
    ringShadow: gl.getUniformLocation(program, 'uRingShadow'),
    ringVisibility: gl.getUniformLocation(program, 'uRingVisibility'),
    rotationSpeed: gl.getUniformLocation(program, 'uRotationSpeed'),
    sourceReady: gl.getUniformLocation(program, 'uSourceReady'),
    sunDirectionView: gl.getUniformLocation(program, 'uSunDirectionView'),
    surfaceRotation: gl.getUniformLocation(program, 'uSurfaceRotation'),
    time: gl.getUniformLocation(program, 'uTime'),
    windScale: gl.getUniformLocation(program, 'uWindScale'),
  }
}

function createResources(gl: WebGL2RenderingContext): UranianResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Uranian vertex array')
  let atmosphereTexture: WebGLTexture | null = null
  let program: WebGLProgram | null = null
  try {
    atmosphereTexture = createAtmosphereTexture(gl)
    program = createProgram(gl)
    const resources = {
      atmosphereTexture,
      program,
      uniforms: getUniforms(gl, program),
      vertexArray,
    }
    gl.bindVertexArray(vertexArray)
    return resources
  } catch (error) {
    if (atmosphereTexture) gl.deleteTexture(atmosphereTexture)
    if (program) gl.deleteProgram(program)
    gl.deleteVertexArray(vertexArray)
    throw error
  }
}

function deleteResources(gl: WebGL2RenderingContext, resources: UranianResources): void {
  gl.deleteTexture(resources.atmosphereTexture)
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

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

function validateAtmosphere(plane: UranianDataPlane): void {
  if (
    plane.width !== ATMOSPHERE_WIDTH ||
    plane.height !== ATMOSPHERE_HEIGHT ||
    plane.data.length !== plane.width * plane.height * 4
  ) {
    throw new Error('Invalid Uranian atmosphere data plane')
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function createUranianRenderer(
  canvas: HTMLCanvasElement,
  source: UranianOrbSource,
): CanvasRenderer<UranianFrameSettings> | null {
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
  let resources: UranianResources | null = createResources(gl)
  let sourceGeneration = 0
  let startTime = performance.now()

  function uploadSource(generation: number): void {
    if (disposed || contextLost || generation !== sourceGeneration || !resources) return
    const frame = source.render()
    if (!frame) {
      hasSource = false
      return
    }
    validateAtmosphere(frame.atmosphere)
    const previousAlignment = gl.getParameter(gl.UNPACK_ALIGNMENT) as number
    try {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      uploadAtmosphere(gl, resources.atmosphereTexture, frame.atmosphere)
      gl.bindTexture(gl.TEXTURE_2D, null)
    } finally {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, previousAlignment)
    }
    hasSource = true
  }

  function refreshSource(): void {
    const generation = ++sourceGeneration
    uploadSource(generation)
    void source.ready?.().then(
      () => uploadSource(generation),
      () => undefined,
    )
  }

  function resize(): void {
    const bounds = canvas!.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio, 2)
    const width = Math.max(Math.round(bounds.width * dpr), 1)
    const height = Math.max(Math.round(bounds.height * dpr), 1)
    if (canvas!.width !== width || canvas!.height !== height) {
      canvas!.width = width
      canvas!.height = height
    }
  }

  function render(timestamp: number, current: UranianFrameSettings): void {
    if (disposed || contextLost || !resources) return
    resize()
    const elapsed = (timestamp - startTime) / 1000
    const sunAzimuthRadians = (current.sunAzimuth * Math.PI) / 180
    const sunElevationRadians = (current.sunElevation * Math.PI) / 180
    const sunElevationCosine = Math.cos(sunElevationRadians)
    const sunDirection = [
      Math.sin(sunAzimuthRadians) * sunElevationCosine,
      Math.cos(sunAzimuthRadians) * sunElevationCosine,
      Math.sin(sunElevationRadians),
    ] as const
    const activeResources = resources

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas!.width, canvas!.height)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(activeResources.program)
    gl.bindVertexArray(activeResources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, activeResources.atmosphereTexture)
    gl.uniform1i(activeResources.uniforms.atmosphereTexture, 0)
    gl.uniform1f(activeResources.uniforms.aerosolDepth, clamp(current.aerosolDepth, 0, 1.5))
    gl.uniform1f(
      activeResources.uniforms.atmosphereThickness,
      clamp(current.atmosphereThickness, 0, 0.08),
    )
    gl.uniform1f(activeResources.uniforms.bandContrast, clamp(current.bandContrast, 0, 0.5))
    gl.uniform1f(activeResources.uniforms.cloudContrast, clamp(current.cloudContrast, 0, 0.5))
    gl.uniform1f(
      activeResources.uniforms.epsilonEccentricity,
      clamp(current.epsilonEccentricity, 0, 0.02),
    )
    gl.uniform1f(
      activeResources.uniforms.epsilonPeriapsis,
      (current.epsilonPeriapsis * Math.PI) / 180,
    )
    gl.uniform1f(activeResources.uniforms.exposure, clamp(current.exposure, 0, 2))
    gl.uniform1f(activeResources.uniforms.forwardScattering, clamp(current.forwardScattering, 0, 1))
    gl.uniform1f(activeResources.uniforms.hazeOpacity, clamp(current.hazeOpacity, 0, 1))
    gl.uniform1f(
      activeResources.uniforms.hoodLatitude,
      (clamp(current.hoodLatitude, 25, 75) * Math.PI) / 180,
    )
    gl.uniform1f(activeResources.uniforms.hoodPole, current.hoodPole < 0 ? -1 : 1)
    gl.uniform1f(
      activeResources.uniforms.hoodSoftness,
      (clamp(current.hoodSoftness, 2, 25) * Math.PI) / 180,
    )
    gl.uniform1f(activeResources.uniforms.limbDarkening, clamp(current.limbDarkening, 0.55, 1.2))
    gl.uniform1f(
      activeResources.uniforms.methaneAbsorption,
      clamp(current.methaneAbsorption, 0, 1.5),
    )
    gl.uniform1f(activeResources.uniforms.oblateness, clamp(current.oblateness, 0, 0.08))
    gl.uniform1f(activeResources.uniforms.phaseFill, clamp(current.phaseFill, 0, 0.35))
    gl.uniform1f(activeResources.uniforms.polarHood, clamp(current.polarHood, 0, 1))
    gl.uniform1f(activeResources.uniforms.poleAzimuth, (current.poleAzimuth * Math.PI) / 180)
    gl.uniform1f(activeResources.uniforms.poleElevation, (current.poleElevation * Math.PI) / 180)
    gl.uniform1f(activeResources.uniforms.ringShadow, clamp(current.ringShadow, 0, 1))
    gl.uniform1f(activeResources.uniforms.ringVisibility, clamp(current.ringVisibility, 0, 6))
    gl.uniform1f(activeResources.uniforms.rotationSpeed, clamp(current.rotationSpeed, -0.05, 0.05))
    gl.uniform1f(activeResources.uniforms.sourceReady, hasSource ? 1 : 0)
    gl.uniform1f(
      activeResources.uniforms.surfaceRotation,
      (current.surfaceRotation * Math.PI) / 180 +
        elapsed * clamp(current.rotationSpeed, -0.05, 0.05),
    )
    gl.uniform1f(activeResources.uniforms.time, elapsed)
    gl.uniform1f(activeResources.uniforms.windScale, clamp(current.windScale, 0, 1))
    gl.uniform2f(activeResources.uniforms.resolution, canvas!.width, canvas!.height)
    gl.uniform3f(activeResources.uniforms.sunDirectionView, ...sunDirection)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  function handleContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
    resources = null
    hasSource = false
    sourceGeneration += 1
  }

  function handleContextRestored(): void {
    if (disposed) return
    contextLost = false
    resources = createResources(gl)
    startTime = performance.now()
    refreshSource()
    resize()
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  try {
    refreshSource()
    resize()
  } catch (error) {
    disposed = true
    sourceGeneration += 1
    resizeObserver.disconnect()
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
      sourceGeneration += 1
      resizeObserver.disconnect()
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost && resources) deleteResources(gl, resources)
      resources = null
    },
  }
}

export function UranianOrbEffect({
  aerosolDepth = 0.72,
  atmosphereThickness = 0.025,
  bandContrast = 0.13,
  className,
  cloudContrast = 0.08,
  epsilonEccentricity = 0.00794,
  epsilonPeriapsis = 0,
  exposure = 0.86,
  forwardScattering = 0.15,
  hazeOpacity = 0.34,
  hoodLatitude = 45,
  hoodPole = 1,
  hoodSoftness = 10,
  limbDarkening = 0.72,
  methaneAbsorption = 0.58,
  oblateness = 0.022927,
  phaseFill = 0.08,
  polarHood = 0.26,
  poleAzimuth = -26,
  poleElevation = 38,
  ringShadow = 0.75,
  ringVisibility = 4.5,
  rotationSpeed = -0.008,
  source,
  style,
  sunAzimuth = -28,
  sunElevation = 55,
  surfaceRotation = 18,
  windScale = 0.2,
}: UranianOrbEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameSettings: UranianFrameSettings = {
    aerosolDepth,
    atmosphereThickness,
    bandContrast,
    cloudContrast,
    epsilonEccentricity,
    epsilonPeriapsis,
    exposure,
    forwardScattering,
    hazeOpacity,
    hoodLatitude,
    hoodPole,
    hoodSoftness,
    limbDarkening,
    methaneAbsorption,
    oblateness,
    phaseFill,
    polarHood,
    poleAzimuth,
    poleElevation,
    ringShadow,
    ringVisibility,
    rotationSpeed,
    sunAzimuth,
    sunElevation,
    surfaceRotation,
    windScale,
  }
  useCanvasRenderer(canvasRef, frameSettings, source, createUranianRenderer)

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', width: '100%', ...style }}
    />
  )
}
