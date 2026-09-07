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

export type VenusianSurface = {
  /** Equirectangular cloud-top structure; only the red channel is read. */
  cloudStructure: TexImageSource
  longitudeOffsetDegrees?: number
}

export type VenusianOrbSource = OrbSource<VenusianSurface>

export type VenusianOrbEffectProps = OrbCanvasProps &
  OrbPoseProps &
  OrbLightingProps & {
    /** Contrast of the source cloud morphology. Range 0–1. @default 0.3 */
    cloudContrast?: number
    /** Procedural cellular and streaky cloud detail. Range 0–1. @default 0.22 */
    cloudDetail?: number
    /** Linear scene gain before tone mapping. @default 1.08 */
    exposure?: number
    /** Rate of the super-rotating cloud flow, in cycles per second. @default 0.045 */
    flowSpeed?: number
    /** Amplitude of the cloud advection; 0 freezes the clouds. Range 0–1. @default 0.7 */
    flowStrength?: number
    /** Forward-scattering brightening of the haze towards the sun. Range 0–1. @default 0.72 */
    forwardScattering?: number
    /** Glory and opposition surge near full phase. Range 0–1. @default 0.18 */
    gloryStrength?: number
    /** Optical depth of the upper haze shell. Range 0–1. @default 0.72 */
    opticalDepth?: number
    source: VenusianOrbSource
    /** Blend from neutral cream (0) towards sulfur yellow-orange (1). @default 0.72 */
    sulfurTint?: number
    /** In-scattering strength of the upper haze shell. Range 0–1. @default 0.46 */
    upperHaze?: number
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAxialTilt',
  'uCloudContrast',
  'uCloudDetail',
  'uCloudStructureTexture',
  'uExposure',
  'uFlowSpeed',
  'uFlowStrength',
  'uForwardScattering',
  'uGloryStrength',
  'uLongitudeOffset',
  'uOpticalDepth',
  'uPointer',
  'uSourceReady',
  'uSulfurTint',
  'uSunDirection',
  'uTime',
  'uUpperHaze',
  'uYaw',
] as const

type VenusianResources = {
  cloudStructureTexture: WebGLTexture
  longitudeOffset: number
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

type VenusianFrameSettings = {
  cloudContrast: number
  cloudDetail: number
  exposure: number
  flowSpeed: number
  flowStrength: number
  forwardScattering: number
  gloryStrength: number
  lean: boolean
  opticalDepth: number
  spin: number
  sulfurTint: number
  sunAzimuth: number
  sunElevation: number
  tilt: number
  upperHaze: number
  yaw: number
}

const VENUS_RADIUS = 0.78
const HAZE_RADIUS = 0.825

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform float uAxialTilt;
uniform float uCloudContrast;
uniform float uCloudDetail;
uniform sampler2D uCloudStructureTexture;
uniform float uExposure;
uniform float uFlowSpeed;
uniform float uFlowStrength;
uniform float uForwardScattering;
uniform float uGloryStrength;
uniform float uLongitudeOffset;
uniform float uOpticalDepth;
uniform vec2 uPointer;
uniform float uSourceReady;
uniform float uSulfurTint;
uniform vec3 uSunDirection;
uniform float uYaw;
uniform float uTime;
uniform float uUpperHaze;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float VENUS_RADIUS = ${VENUS_RADIUS.toFixed(3)};
const float HAZE_RADIUS = ${HAZE_RADIUS.toFixed(3)};
const float HAZE_THICKNESS = HAZE_RADIUS - VENUS_RADIUS;
const float CAMERA_DISTANCE = 2.5;
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
  float weight = 0.54;
  for (int octave = 0; octave < 4; octave += 1) {
    value += valueNoise(point) * weight;
    point = point * 2.03 + vec3(11.1, 7.3, 5.7);
    weight *= 0.48;
  }
  return value / 1.016;
}

vec3 orientedCloudDirection(vec3 radialDirection) {
  vec3 tilted = rotateX(radialDirection, uAxialTilt + uPointer.y * 0.1);
  return rotateY(tilted, uLongitudeOffset + uYaw + uPointer.x * 0.16);
}

vec3 advectedCloudDirection(vec3 direction) {
  if (uFlowStrength <= 0.0001) return direction;

  float longitude = atan(direction.x, direction.z);
  float latitude = asin(clamp(direction.y, -1.0, 1.0));
  float latitudeCosine = max(cos(latitude), 0.0);
  float phase = uTime * uFlowSpeed;
  float differentialDrift = phase * (0.12 * latitudeCosine * latitudeCosine - 0.025);
  float planetaryWave = sin(longitude * 3.0 - phase * 0.52) *
    cos(latitude * 2.0) * 0.022;
  float obliqueWave = sin(longitude * 2.0 + latitude * 5.0 + phase * 0.31) * 0.01;
  longitude += (differentialDrift + planetaryWave + obliqueWave) * uFlowStrength;
  latitude += sin(longitude * 2.0 - phase * 0.21) *
    latitudeCosine * 0.008 * uFlowStrength;
  return directionFromLongitudeLatitude(longitude, latitude);
}

float proceduralCloudDetail(vec3 direction) {
  if (uCloudDetail <= 0.0001) return 0.0;

  float longitude = atan(direction.x, direction.z);
  float latitude = asin(clamp(direction.y, -1.0, 1.0));
  float latitudeSine = abs(sin(latitude));
  float latitudeCosine = max(cos(latitude), 0.0);
  float phase = uTime * uFlowSpeed;

  vec3 cellularDomain = direction * 9.0 + vec3(phase * 0.09, -phase * 0.035, phase * 0.06);
  float cellularBroad = fbm(cellularDomain * 0.52);
  float cellularFine = fbm(cellularDomain + (cellularBroad - 0.5) * 2.2);
  float cellular = (cellularFine - 0.5) * 0.78 + (cellularBroad - 0.5) * 0.3;

  float streakWarp = fbm(direction * 5.2 + vec3(-phase * 0.04, phase * 0.025, 0.0));
  float oblique = sin(
    longitude * 11.0 + sign(latitude) * latitude * 25.0 + streakWarp * 4.2 - phase * 0.42
  );
  float streakGrain = fbm(direction * vec3(16.0, 8.0, 16.0) + streakWarp * 1.7);
  float streaks = oblique * 0.28 + (streakGrain - 0.5) * 0.46;

  float streakMix = smoothstep(0.38, 0.76, latitudeSine);
  float poleFade = smoothstep(0.04, 0.24, latitudeCosine);
  float polarSpiral = sin(
    longitude * 2.0 + sign(latitude) * latitude * 9.0 + streakWarp * 3.0 + phase * 0.18
  ) * smoothstep(0.76, 0.94, latitudeSine) * 0.12;
  return (mix(cellular, streaks, streakMix) + polarSpiral) * poleFade * uCloudDetail;
}

float henyeyGreenstein(float cosineTheta, float asymmetry) {
  float g2 = asymmetry * asymmetry;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * asymmetry * cosineTheta, 0.001), 1.5);
}

bool planetShadowsPoint(vec3 point, vec3 lightDirection) {
  vec2 hit = raySphere(point + lightDirection * 0.001, lightDirection, VENUS_RADIUS);
  return hit.y > 0.0;
}

vec4 integrateUpperHaze(
  vec3 rayOrigin,
  vec3 rayDirection,
  float startDistance,
  float endDistance,
  vec3 lightDirection,
  vec3 viewDirection
) {
  if (uUpperHaze <= 0.0001 || uOpticalDepth <= 0.0001 || endDistance <= startDistance) {
    return vec4(0.0);
  }

  float segmentLength = endDistance - startDistance;
  float stepLength = segmentLength / 8.0;
  float viewOpticalDepth = 0.0;
  vec3 scattering = vec3(0.0);
  float forwardCosine = dot(-lightDirection, viewDirection);
  float forwardPhase = uForwardScattering > 0.0001
    ? henyeyGreenstein(forwardCosine, 0.82) * uForwardScattering * 0.015
    : 0.0;
  float phaseAlignment = clamp(dot(lightDirection, viewDirection), -1.0, 1.0);
  float gloryPhase = exp(-pow((1.0 - phaseAlignment) / 0.045, 2.0)) *
    uGloryStrength * 0.07;
  vec3 aerosolColor = mix(
    vec3(1.04, 0.84, 0.56),
    vec3(1.08, 0.62, 0.24),
    clamp(uSulfurTint, 0.0, 1.0) * 0.72
  );

  for (int stepIndex = 0; stepIndex < 8; stepIndex += 1) {
    float distance = startDistance + (float(stepIndex) + 0.5) * stepLength;
    vec3 point = rayOrigin + rayDirection * distance;
    float normalizedHeight = clamp((length(point) - VENUS_RADIUS) / HAZE_THICKNESS, 0.0, 1.0);
    float density = exp(-normalizedHeight * 5.2) * (1.0 - smoothstep(0.82, 1.0, normalizedHeight));
    float normalizedStep = stepLength / HAZE_THICKNESS;
    float stepOpticalDepth = density * normalizedStep * uOpticalDepth * 0.72;
    vec3 localNormal = normalize(point);
    float lightCosine = dot(localNormal, lightDirection);
    float horizonPath = 1.0 / max(
      0.09,
      lightCosine + sqrt(max(lightCosine * lightCosine + normalizedHeight * 0.12, 0.0))
    );
    float sunOpticalDepth = density * horizonPath * uOpticalDepth * 0.16;
    float sunVisibility = planetShadowsPoint(point, lightDirection)
      ? 0.0
      : exp(-sunOpticalDepth);
    float sunwardIllumination = smoothstep(-0.08, 0.12, lightCosine);
    float aerosolPhase = 0.065 + forwardPhase + gloryPhase;
    float viewTransmittance = exp(-viewOpticalDepth);
    float scatterAmount = density * normalizedStep * uUpperHaze * 0.12;
    scattering += aerosolColor * aerosolPhase * scatterAmount *
      sunVisibility * sunwardIllumination * viewTransmittance;
    viewOpticalDepth += stepOpticalDepth;
  }

  return vec4(scattering, viewOpticalDepth);
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
  float shellDistance = length(position) / HAZE_RADIUS;
  float shellEdge = max(fwidth(shellDistance), 0.0005);
  float shellCoverage = 1.0 - smoothstep(1.0 - shellEdge, 1.0 + shellEdge, shellDistance);
  if (shellCoverage <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 rayOrigin = vec3(position, CAMERA_DISTANCE);
  vec3 rayDirection = vec3(0.0, 0.0, -1.0);
  vec3 viewDirection = -rayDirection;
  vec2 shellHit = raySphere(rayOrigin, rayDirection, HAZE_RADIUS);
  vec2 bodyHit = raySphere(rayOrigin, rayDirection, VENUS_RADIUS);
  bool hitsBody = bodyHit.x > 0.0;
  float hazeStart = max(shellHit.x, 0.0);
  float hazeEnd = hitsBody ? bodyHit.x : shellHit.y;
  vec4 haze = integrateUpperHaze(
    rayOrigin,
    rayDirection,
    hazeStart,
    hazeEnd,
    uSunDirection,
    viewDirection
  );

  vec3 linearColor = haze.rgb;
  float bodyCoverage = 0.0;
  if (hitsBody) {
    float bodyDistance = length(position) / VENUS_RADIUS;
    float bodyEdge = max(fwidth(bodyDistance), 0.0005);
    bodyCoverage = 1.0 - smoothstep(1.0 - bodyEdge, 1.0 + bodyEdge, bodyDistance);
    vec3 surfacePoint = rayOrigin + rayDirection * bodyHit.x;
    vec3 normal = normalize(surfacePoint);
    vec3 cloudDirection = advectedCloudDirection(orientedCloudDirection(normal));
    float sourceStructure = sampleEquirectangular(uCloudStructureTexture, cloudDirection).r;
    float latitude = asin(clamp(cloudDirection.y, -1.0, 1.0));
    float latitudeSine = abs(sin(latitude));
    float morphology = (sourceStructure - 0.5) * 2.0 * uCloudContrast;
    float detail = proceduralCloudDetail(cloudDirection);
    float brightHood = smoothstep(0.68, 0.86, latitudeSine) *
      (1.0 - smoothstep(0.93, 0.995, latitudeSine)) * 0.08;
    float darkPolarRing = exp(-pow((latitudeSine - 0.94) / 0.035, 2.0)) * -0.045;
    float cloudValue = morphology * 1.25 + detail * 1.15 + brightHood + darkPolarRing;

    vec3 neutralCloud = vec3(1.02, 0.91, 0.72);
    vec3 sulfurCloud = vec3(1.07, 0.73, 0.34);
    vec3 cloudColor = mix(
      neutralCloud,
      sulfurCloud,
      clamp(uSulfurTint, 0.0, 1.0) * 0.62
    );
    cloudColor *= 1.0 + cloudValue;
    cloudColor += max(-cloudValue, 0.0) * vec3(0.015, -0.018, -0.035);

    float viewCosine = max(dot(normal, viewDirection), 0.0);
    float incident = dot(normal, uSunDirection);
    float dayVisibility = smoothstep(-0.055, 0.095, incident);
    float incidentCosine = max(incident, 0.0);
    float lommelSeeliger = min(
      (2.0 * incidentCosine) / max(incidentCosine + viewCosine, 0.0001),
      1.35
    );
    float multipleScattering = pow(incidentCosine, 0.43);
    float reflectedLight = mix(multipleScattering, lommelSeeliger, 0.31);
    float phaseAlignment = clamp(dot(uSunDirection, viewDirection), -1.0, 1.0);
    float broadBackscatter = 0.82 + 0.18 * pow(max(phaseAlignment, 0.0), 2.0);
    float nearFullPhase = exp(-pow((1.0 - phaseAlignment) / 0.055, 2.0));
    float oppositionSurge = 1.0 + nearFullPhase * uGloryStrength * 0.32;
    float lighting = mix(
      0.0015,
      reflectedLight * oppositionSurge * broadBackscatter,
      dayVisibility
    );
    vec3 bodyColor = cloudColor * lighting;
    bodyColor = bodyColor * exp(-haze.a) + haze.rgb;
    linearColor = mix(linearColor, bodyColor, bodyCoverage);
  }

  linearColor = filmic(linearColor * uExposure);
  linearColor = pow(linearColor, vec3(1.0 / 2.2));
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  linearColor = clamp(linearColor + dither, 0.0, 1.0);
  float hazeAlpha = max(1.0 - exp(-haze.a), max(haze.r, max(haze.g, haze.b)));
  float alpha = mix(hazeAlpha, 1.0, bodyCoverage) * shellCoverage;
  fragColor = vec4(linearColor * shellCoverage, alpha);
}
`

const spec: OrbRendererSpec<VenusianResources, VenusianFrameSettings, VenusianSurface> = {
  label: 'Venus',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Venus')
    return {
      cloudStructureTexture: createTexture(gl, 'Venus cloud structure'),
      longitudeOffset: 0,
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Venus'),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteTexture(resources.cloudStructureTexture)
    gl.deleteProgram(resources.program)
    gl.deleteVertexArray(resources.vertexArray)
  },
  upload(gl, resources, surface) {
    withUnpackState(gl, { flipY: true, premultiplyAlpha: false }, () => {
      uploadImage(gl, resources.cloudStructureTexture, surface.cloudStructure)
    })
    resources.longitudeOffset = degreesToRadians(surface.longitudeOffsetDegrees ?? 0)
  },
  isAnimated(settings) {
    // Cloud advection and procedural detail both advance with uTime * uFlowSpeed.
    const cloudsMove =
      settings.flowSpeed !== 0 && (settings.flowStrength > 0 || settings.cloudDetail > 0)
    return settings.spin !== 0 || cloudsMove
  },
  render(gl, resources, frame) {
    const { composition, elapsed, hasSource, pointerX, pointerY, settings } = frame
    const { uniforms } = resources

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.cloudStructureTexture)
    gl.uniform1i(uniforms.uCloudStructureTexture, 0)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uAxialTilt, degreesToRadians(settings.tilt))
    gl.uniform1f(uniforms.uCloudContrast, settings.cloudContrast)
    gl.uniform1f(uniforms.uCloudDetail, settings.cloudDetail)
    gl.uniform1f(uniforms.uExposure, settings.exposure)
    gl.uniform1f(uniforms.uFlowSpeed, settings.flowSpeed)
    gl.uniform1f(uniforms.uFlowStrength, settings.flowStrength)
    gl.uniform1f(uniforms.uForwardScattering, settings.forwardScattering)
    gl.uniform1f(uniforms.uGloryStrength, settings.gloryStrength)
    gl.uniform1f(uniforms.uLongitudeOffset, resources.longitudeOffset)
    gl.uniform1f(uniforms.uOpticalDepth, settings.opticalDepth)
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform1f(uniforms.uSulfurTint, settings.sulfurTint)
    gl.uniform3f(
      uniforms.uSunDirection,
      ...sunDirection(settings.sunAzimuth, settings.sunElevation),
    )
    gl.uniform1f(uniforms.uYaw, degreesToRadians(settings.yaw + elapsed * settings.spin))
    gl.uniform1f(uniforms.uTime, elapsed)
    gl.uniform1f(uniforms.uUpperHaze, settings.upperHaze)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function VenusianOrbEffect({
  className,
  cloudContrast = 0.3,
  cloudDetail = 0.22,
  composition,
  exposure = 1.08,
  flowSpeed = 0.045,
  flowStrength = 0.7,
  forwardScattering = 0.72,
  gloryStrength = 0.18,
  lean = true,
  onError,
  opticalDepth = 0.72,
  paused,
  source,
  spin = -1.5,
  style,
  sulfurTint = 0.72,
  sunAzimuth = -52,
  sunElevation = 9,
  tilt = -3,
  upperHaze = 0.46,
  viewport,
  yaw = 0,
}: VenusianOrbEffectProps) {
  const settings: VenusianFrameSettings = {
    cloudContrast,
    cloudDetail,
    exposure,
    flowSpeed,
    flowStrength,
    forwardScattering,
    gloryStrength,
    lean,
    opticalDepth,
    spin,
    sulfurTint,
    sunAzimuth,
    sunElevation,
    tilt,
    upperHaze,
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
