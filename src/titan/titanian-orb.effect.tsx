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
  withUnpackState,
} from '../internal/webgl'
import type { OrbCanvasProps, OrbLightingProps, OrbPoseProps } from '../orb'

export type TitanianDataPlane = {
  data: Uint8Array
  height: number
  width: number
}

export type TitanianSurface = {
  /** 1024×512 RGBA equirectangular plane: RG band structure, B detached haze, A polar hood mask. */
  atmosphere: TitanianDataPlane
}

export type TitanianOrbSource = OrbSource<TitanianSurface>

export type TitanianOrbEffectProps = OrbCanvasProps &
  OrbPoseProps &
  OrbLightingProps & {
    /** Contrast of the latitudinal haze bands. Range 0–1.5. @default 0.28 */
    bandContrast?: number
    /** Density of the detached high-altitude haze layer. Range 0–1.8. @default 0.72 */
    detachedHaze?: number
    /** Linear scene gain before tone mapping. Range 0.45–1.8. @default 1 */
    exposure?: number
    /** Forward-scatter brightening of the haze towards the sun. Range 0–1.8. @default 1 */
    forwardScattering?: number
    /** Optical density of the main haze layer. Range 0–2.5. @default 1 */
    hazeDensity?: number
    /** Vertical extent of the main haze layer. Range 0–1.6. @default 1 */
    hazeThickness?: number
    /** Darkening and extra density of the polar hood. Range 0–1.5. @default 0.34 */
    polarHood?: number
    source: TitanianOrbSource
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAtmosphereTexture',
  'uBandContrast',
  'uDetachedEnabled',
  'uDetachedHaze',
  'uExposure',
  'uForwardScattering',
  'uHazeDensity',
  'uHazeThickness',
  'uLatitude',
  'uMainEnabled',
  'uPolarHood',
  'uSourceReady',
  'uSpin',
  'uSunDirection',
  'uTime',
  'uYaw',
] as const

type TitanianResources = {
  atmosphereTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

type TitanianFrameSettings = {
  bandContrast: number
  detachedHaze: number
  exposure: number
  forwardScattering: number
  hazeDensity: number
  hazeThickness: number
  lean: boolean
  polarHood: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  tilt: number
  yaw: number
}

const ATMOSPHERE_WIDTH = 1024
const ATMOSPHERE_HEIGHT = 512
const TITAN_RADIUS = 0.74
/** Pointer lean nudges the pose by up to this many degrees. */
const LEAN_YAW_DEGREES = 6
const LEAN_TILT_DEGREES = 4

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uAtmosphereTexture;
uniform float uBandContrast;
uniform float uDetachedEnabled;
uniform float uDetachedHaze;
uniform float uExposure;
uniform float uForwardScattering;
uniform float uHazeDensity;
uniform float uHazeThickness;
uniform float uYaw;
uniform float uMainEnabled;
uniform float uPolarHood;
uniform float uSpin;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uTime;
uniform float uLatitude;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float BODY_RADIUS = ${TITAN_RADIUS.toFixed(2)};
const float BODY_RADIUS_KM = 2574.73;
const float CAMERA_DISTANCE = 3.0;
const float MAIN_OUTER_ALTITUDE = 300.0 / BODY_RADIUS_KM;
const float MAIN_SCALE_HEIGHT = 65.0 / BODY_RADIUS_KM;
const float DETACHED_INNER_RADIUS = 1.0 + 360.0 / BODY_RADIUS_KM;
const float DETACHED_OUTER_RADIUS = 1.0 + 640.0 / BODY_RADIUS_KM;
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

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

vec2 raySphere(vec3 origin, vec3 direction, float radius) {
  float projection = dot(origin, direction);
  float discriminant = projection * projection - dot(origin, origin) + radius * radius;
  if (discriminant < 0.0) return vec2(-1.0);
  float root = sqrt(discriminant);
  return vec2(-projection - root, -projection + root);
}

vec2 sphereUv(vec3 direction) {
  float longitude = atan(direction.x, direction.z) / TAU + 0.5;
  float latitude = asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5;
  return vec2(
    fract(longitude + 0.5 / 1024.0),
    (clamp(latitude, 0.0, 1.0) * 511.0 + 0.5) / 512.0
  );
}

vec3 atmosphereDirection(vec3 point) {
  vec3 bodyDirection = rotateX(normalize(point), -uLatitude);
  return rotateY(bodyDirection, uYaw + uTime * uSpin);
}

vec4 sampleAtmosphere(vec3 point) {
  return textureLod(uAtmosphereTexture, sphereUv(atmosphereDirection(point)), 1.5);
}

float mainSourceModulation(vec4 atmosphere) {
  if (uBandContrast <= 0.0) return 1.0;
  float broad = (atmosphere.r - 0.5) * 0.8 + (atmosphere.g - 0.5) * 1.15;
  return max(1.0 + broad * uBandContrast, 0.58);
}

float hoodAmount(vec4 atmosphere) {
  return uPolarHood <= 0.0 ? 0.0 : atmosphere.a * uPolarHood;
}

float mainDensity(vec3 point) {
  float altitude = length(point) / BODY_RADIUS - 1.0;
  float outerAltitude = MAIN_OUTER_ALTITUDE * uHazeThickness;
  if (altitude < 0.0 || altitude >= outerAltitude || outerAltitude <= 0.0) return 0.0;
  float fadeStart = max(outerAltitude * 0.72, outerAltitude - 0.018);
  float outerFade = 1.0 - smoothstep(fadeStart, outerAltitude, altitude);
  vec4 atmosphere = sampleAtmosphere(point);
  float polarDensity = 1.0 + hoodAmount(atmosphere) * 0.08;
  return exp(-altitude / MAIN_SCALE_HEIGHT) * outerFade *
    mainSourceModulation(atmosphere) * polarDensity;
}

float detachedDensity(vec3 point) {
  float altitudeKilometers = (length(point) / BODY_RADIUS - 1.0) * BODY_RADIUS_KM;
  if (altitudeKilometers <= 360.0 || altitudeKilometers >= 640.0) return 0.0;
  float rawDensity = altitudeKilometers <= 500.0
    ? exp((altitudeKilometers - 500.0) / 22.0)
    : exp(-(altitudeKilometers - 500.0) / 35.0);
  float window = smoothstep(360.0, 390.0, altitudeKilometers) *
    (1.0 - smoothstep(610.0, 640.0, altitudeKilometers));
  vec4 atmosphere = sampleAtmosphere(point);
  float sourceModulation = max(1.0 + (atmosphere.b - 0.5) * 0.32, 0.78);
  float polarDensity = 1.0 + hoodAmount(atmosphere) * 0.06;
  return rawDensity * window * sourceModulation * polarDensity;
}

float henyeyGreenstein(float cosineTheta, float asymmetry) {
  float g2 = asymmetry * asymmetry;
  return (1.0 - g2) /
    pow(max(1.0 + g2 - 2.0 * asymmetry * cosineTheta, 0.0001), 1.5);
}

float mainPhase() {
  float mu = -uSunDirection.z;
  float broadLobes = 0.72 * henyeyGreenstein(mu, 0.62) +
    0.28 * henyeyGreenstein(mu, 0.22);
  float directionalExcess = max(broadLobes - 0.62, 0.0);
  return 0.28 + uForwardScattering * min(directionalExcess, 4.0) * 0.18;
}

float detachedPhase() {
  float mu = -uSunDirection.z;
  float fittedPhase = 1.006058 * (
    0.759824 * henyeyGreenstein(mu, 0.910696) +
    0.240176 * henyeyGreenstein(mu, 0.410994)
  );
  float directionalExcess = max(fittedPhase - 0.117, 0.0);
  return 0.22 + uForwardScattering * min(directionalExcess, 8.0) * 0.55;
}

float bodySunVisibility(vec3 point) {
  float projection = dot(point, uSunDirection);
  float closestSquared = dot(point, point) - projection * projection;
  float discriminant = BODY_RADIUS * BODY_RADIUS - closestSquared;
  float edge = max(6.4 * BODY_RADIUS / uCompositionScale, 0.000001);
  float shadow = smoothstep(-edge, edge, discriminant) * step(projection, -0.00001);
  return 1.0 - shadow;
}

float solarOpticalDepth(vec3 point, float mainOuterRadius) {
  vec2 shellHit = raySphere(point + uSunDirection * 0.0001, uSunDirection, mainOuterRadius);
  float endDistance = max(shellHit.y, 0.0);
  if (endDistance <= 0.0) return 0.0;
  return mainDensity(point + uSunDirection * endDistance * 0.5) *
    endDistance / BODY_RADIUS;
}

vec4 integrateMain(
  vec3 rayOrigin,
  vec3 rayDirection,
  float startDistance,
  float endDistance,
  float mainOuterRadius
) {
  if (uMainEnabled <= 0.0 || endDistance <= startDistance) return vec4(0.0);
  float intervalLength = endDistance - startDistance;
  float stepLength = intervalLength / 4.0;
  float halfLength = intervalLength * 0.5;
  float midpoint = (startDistance + endDistance) * 0.5;
  bool thinShell = uHazeThickness < 0.5;
  float viewOpticalDepth = 0.0;
  vec3 scattering = vec3(0.0);
  float phase = mainPhase();
  vec3 tint = vec3(1.12, 0.61, 0.25);

  for (int index = 0; index < 4; index += 1) {
    float node = index == 0 ? -0.8611363116 :
      index == 1 ? -0.3399810436 :
      index == 2 ? 0.3399810436 : 0.8611363116;
    float weight = index == 0 || index == 3 ? 0.3478548451 : 0.6521451549;
    float distance = thinShell
      ? midpoint + node * halfLength
      : startDistance + (float(index) + 0.5) * stepLength;
    vec3 point = rayOrigin + rayDirection * distance;
    float density = mainDensity(point);
    float normalizedStep = (thinShell ? weight * halfLength : stepLength) / BODY_RADIUS;
    float segmentOpticalDepth = density * normalizedStep * uHazeDensity * 3.8;
    float segmentOpacity = 1.0 - exp(-segmentOpticalDepth);
    float sunOpticalDepth = solarOpticalDepth(point, mainOuterRadius) *
      uHazeDensity * 3.8;
    float visibility = bodySunVisibility(point);
    scattering += exp(-viewOpticalDepth - sunOpticalDepth) *
      visibility * tint * phase * segmentOpacity;
    viewOpticalDepth += segmentOpticalDepth;
  }

  return vec4(scattering, viewOpticalDepth);
}

vec4 integrateDetachedSegment(
  vec3 rayOrigin,
  vec3 rayDirection,
  float startDistance,
  float endDistance
) {
  if (uDetachedEnabled <= 0.0 || endDistance <= startDistance) return vec4(0.0);
  float stepLength = (endDistance - startDistance) / 5.0;
  float viewOpticalDepth = 0.0;
  vec3 scattering = vec3(0.0);
  float phase = detachedPhase();
  vec3 tint = vec3(0.46, 0.64, 0.86);

  for (int index = 0; index < 5; index += 1) {
    float distance = startDistance + (float(index) + 0.5) * stepLength;
    vec3 point = rayOrigin + rayDirection * distance;
    float density = detachedDensity(point);
    float segmentOpticalDepth = density * stepLength / BODY_RADIUS * uDetachedHaze * 0.17;
    float segmentOpacity = 1.0 - exp(-segmentOpticalDepth);
    scattering += exp(-viewOpticalDepth) * bodySunVisibility(point) *
      tint * phase * segmentOpacity;
    viewOpticalDepth += segmentOpticalDepth;
  }

  return vec4(scattering, viewOpticalDepth);
}

vec3 shadeOpaqueAerosolBody(vec3 point) {
  vec3 normal = normalize(point);
  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float viewCosine = max(dot(normal, viewDirection), 0.0);
  float incident = dot(normal, uSunDirection);
  float direct = pow(max(incident, 0.0), 0.34);
  float dayVisibility = smoothstep(-0.24, 0.2, incident);
  float twilight = exp(-pow((incident + 0.09) / 0.24, 2.0)) * 0.075;
  float lighting = mix(0.014, 0.42 + direct * 0.58, dayVisibility) + twilight;
  float limb = 0.57 + 0.43 * pow(viewCosine, 0.28);

  vec4 atmosphere = sampleAtmosphere(point);
  float structure = uBandContrast <= 0.0
    ? 0.0
    : ((atmosphere.r - 0.5) * 0.32 + (atmosphere.g - 0.5) * 0.42) * uBandContrast;
  vec3 bodyColor = vec3(1.08, 0.57, 0.17) * (1.0 + structure);
  float hood = hoodAmount(atmosphere);
  bodyColor = mix(bodyColor, vec3(0.63, 0.29, 0.085), clamp(hood * 0.34, 0.0, 0.55));
  return max(bodyColor * lighting * limb, 0.0);
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
  vec3 rayOrigin = vec3(position, CAMERA_DISTANCE);
  vec3 rayDirection = vec3(0.0, 0.0, -1.0);
  float radialDistance = length(position);
  float bodyEdge = max(fwidth(radialDistance), 0.0005);
  float bodyCoverage = 1.0 - smoothstep(
    BODY_RADIUS - bodyEdge,
    BODY_RADIUS + bodyEdge,
    radialDistance
  );
  vec2 bodyHit = raySphere(rayOrigin, rayDirection, BODY_RADIUS);
  bool hitsBody = bodyHit.x > 0.0;

  float mainOuterRadius = BODY_RADIUS * (1.0 + MAIN_OUTER_ALTITUDE * uHazeThickness);
  vec4 mainLayer = vec4(0.0);
  if (uMainEnabled > 0.0) {
    vec2 mainHit = raySphere(rayOrigin, rayDirection, mainOuterRadius);
    if (mainHit.x > 0.0) {
      float mainEnd = hitsBody ? bodyHit.x : mainHit.y;
      mainLayer = integrateMain(
        rayOrigin,
        rayDirection,
        max(mainHit.x, 0.0),
        mainEnd,
        mainOuterRadius
      );
    }
  }

  vec4 detachedFront = vec4(0.0);
  vec4 detachedBack = vec4(0.0);
  if (uDetachedEnabled > 0.0) {
    vec2 outerHit = raySphere(rayOrigin, rayDirection, BODY_RADIUS * DETACHED_OUTER_RADIUS);
    if (outerHit.x > 0.0) {
      vec2 innerHit = raySphere(rayOrigin, rayDirection, BODY_RADIUS * DETACHED_INNER_RADIUS);
      if (innerHit.x > 0.0) {
        detachedFront = integrateDetachedSegment(
          rayOrigin,
          rayDirection,
          max(outerHit.x, 0.0),
          innerHit.x
        );
        if (!hitsBody) {
          detachedBack = integrateDetachedSegment(
            rayOrigin,
            rayDirection,
            innerHit.y,
            outerHit.y
          );
        }
      } else {
        detachedFront = integrateDetachedSegment(
          rayOrigin,
          rayDirection,
          max(outerHit.x, 0.0),
          outerHit.y
        );
      }
    }
  }

  float backAlpha = 1.0 - exp(-detachedBack.a);
  vec3 shellPremultiplied = detachedBack.rgb;
  float shellAlpha = backAlpha;
  float mainTransmittance = exp(-mainLayer.a);
  shellPremultiplied = mainLayer.rgb + shellPremultiplied * mainTransmittance;
  shellAlpha = (1.0 - mainTransmittance) + shellAlpha * mainTransmittance;
  float detachedFrontTransmittance = exp(-detachedFront.a);
  shellPremultiplied = detachedFront.rgb + shellPremultiplied * detachedFrontTransmittance;
  shellAlpha =
    (1.0 - detachedFrontTransmittance) + shellAlpha * detachedFrontTransmittance;

  vec3 linearPremultiplied = shellPremultiplied;
  float alpha = shellAlpha;
  if (bodyCoverage > 0.0) {
    float frontZ = sqrt(max(BODY_RADIUS * BODY_RADIUS - radialDistance * radialDistance, 0.0));
    vec3 bodyPoint = vec3(position, frontZ);
    vec3 bodyColor = shadeOpaqueAerosolBody(bodyPoint);
    vec3 bodyComposite = mainLayer.rgb + bodyColor * mainTransmittance;
    bodyComposite = detachedFront.rgb + bodyComposite * detachedFrontTransmittance;
    linearPremultiplied = mix(shellPremultiplied, bodyComposite, bodyCoverage);
    alpha = mix(shellAlpha, 1.0, bodyCoverage);
  }

  if (alpha <= 0.00001) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 straightColor = linearPremultiplied / alpha;
  straightColor = filmic(straightColor * uExposure);
  straightColor = pow(straightColor, vec3(1.0 / 2.2));
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  straightColor = clamp(straightColor + dither, 0.0, 1.0);
  fragColor = vec4(straightColor * alpha, alpha);
}
`

function validateAtmosphere(plane: TitanianDataPlane): void {
  if (
    !(plane.data instanceof Uint8Array) ||
    !Number.isInteger(plane.width) ||
    !Number.isInteger(plane.height) ||
    plane.width !== ATMOSPHERE_WIDTH ||
    plane.height !== ATMOSPHERE_HEIGHT ||
    plane.data.length !== plane.width * plane.height * 4
  ) {
    throw new Error('Invalid Titanian atmosphere data plane')
  }
}

/** Upload the RGBA atmosphere plane. Caller owns unpack state. */
function uploadAtmosphere(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  plane: TitanianDataPlane,
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

const spec: OrbRendererSpec<TitanianResources, TitanianFrameSettings, TitanianSurface> = {
  label: 'Titan',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Titan')
    return {
      atmosphereTexture: createTexture(gl, 'Titan atmosphere', { placeholder: [128, 128, 128, 0] }),
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Titan'),
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
    const hazeDensity = clamp(settings.hazeDensity, 0, 2.5)
    const hazeThickness = clamp(settings.hazeThickness, 0, 1.6)
    const detachedHaze = clamp(settings.detachedHaze, 0, 1.8)
    // The shader has no pointer uniform; lean nudges the pose instead.
    const yaw = clamp(settings.yaw + pointerX * LEAN_YAW_DEGREES, -180, 180)
    const tilt = clamp(settings.tilt + pointerY * LEAN_TILT_DEGREES, -55, 55)

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.atmosphereTexture)
    gl.uniform1i(uniforms.uAtmosphereTexture, 0)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uBandContrast, clamp(settings.bandContrast, 0, 1.5))
    gl.uniform1f(uniforms.uDetachedEnabled, detachedHaze > 0 ? 1 : 0)
    gl.uniform1f(uniforms.uDetachedHaze, detachedHaze)
    gl.uniform1f(uniforms.uExposure, clamp(settings.exposure, 0.45, 1.8))
    gl.uniform1f(uniforms.uForwardScattering, clamp(settings.forwardScattering, 0, 1.8))
    gl.uniform1f(uniforms.uHazeDensity, hazeDensity)
    gl.uniform1f(uniforms.uHazeThickness, hazeThickness)
    gl.uniform1f(uniforms.uYaw, degreesToRadians(yaw))
    gl.uniform1f(uniforms.uMainEnabled, hazeDensity > 0 && hazeThickness > 0 ? 1 : 0)
    gl.uniform1f(uniforms.uPolarHood, clamp(settings.polarHood, 0, 1.5))
    gl.uniform1f(uniforms.uSpin, degreesToRadians(clamp(settings.spin, 0, 4.6)))
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform1f(uniforms.uTime, elapsed)
    gl.uniform1f(uniforms.uLatitude, degreesToRadians(tilt))
    gl.uniform3f(
      uniforms.uSunDirection,
      ...sunDirection(clamp(settings.sunAzimuth, -180, 180), clamp(settings.sunElevation, -80, 80)),
    )
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function TitanianOrbEffect({
  bandContrast = 0.28,
  className,
  composition,
  detachedHaze = 0.72,
  exposure = 1,
  forwardScattering = 1,
  hazeDensity = 1,
  hazeThickness = 1,
  lean = true,
  onError,
  paused,
  polarHood = 0.34,
  source,
  spin = 0.7,
  style,
  sunAzimuth = -58,
  sunElevation = 18,
  tilt = 8,
  viewport,
  yaw = 0,
}: TitanianOrbEffectProps) {
  const settings: TitanianFrameSettings = {
    bandContrast,
    detachedHaze,
    exposure,
    forwardScattering,
    hazeDensity,
    hazeThickness,
    lean,
    polarHood,
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
