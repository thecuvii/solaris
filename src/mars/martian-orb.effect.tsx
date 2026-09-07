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

export type MartianSurface = {
  /** Equirectangular sRGB albedo. */
  albedo: TexImageSource
  /** Elevation range encoded in the height channels, in metres relative to the datum. */
  heightRangeMeters: readonly [minimum: number, maximum: number]
  longitudeOffsetDegrees?: number
  /** RG: octahedral tangent normal. BA: 16-bit height, high byte in B. */
  normalHeight: TexImageSource
}

export type MartianOrbSource = OrbSource<MartianSurface>

export type MartianOrbEffectProps = OrbCanvasProps &
  OrbPoseProps &
  OrbLightingProps & {
    /** Blue forward-scatter aureole along the limb and terminator. Range 0–1. @default 0.12 */
    blueAureole?: number
    /** Atmosphere optical depth. Range 0–1. @default 0.22 */
    density?: number
    /** Suspended dust load; reddens and softens the sky. Range 0–1. @default 0.36 */
    dustAerosol?: number
    /** Procedural dust-grain albedo variation. Range 0–1. @default 0.1 */
    dustDetail?: number
    /** Linear scene gain before tone mapping. @default 1.06 */
    exposure?: number
    /** Tangent-space normal map strength. Range 0–3. @default 1.6 */
    normalStrength?: number
    /** Blend from Lambert (0) towards a granular Oren–Nayar/Lommel–Seeliger model (1). @default 0.45 */
    photometricMix?: number
    /** Terrain self-shadowing from the height map. Range 0–2. @default 1 */
    reliefShadowStrength?: number
    source: MartianOrbSource
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAlbedoTexture',
  'uAxialTilt',
  'uBlueAureole',
  'uDensity',
  'uDustAerosol',
  'uDustDetail',
  'uExposure',
  'uHeightScale',
  'uHeightTexture',
  'uLongitudeOffset',
  'uNormalStrength',
  'uNormalTexture',
  'uPhotometricMix',
  'uPointer',
  'uReliefShadowStrength',
  'uSourceReady',
  'uSunDirection',
  'uYaw',
] as const

type MartianResources = {
  albedoTexture: WebGLTexture
  /** Radians, derived from the uploaded surface. */
  heightScale: number
  heightTexture: WebGLTexture
  longitudeOffset: number
  normalTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

type MartianFrameSettings = {
  blueAureole: number
  density: number
  dustAerosol: number
  dustDetail: number
  exposure: number
  lean: boolean
  normalStrength: number
  photometricMix: number
  reliefShadowStrength: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  tilt: number
  yaw: number
}

const MARS_MEAN_RADIUS_METERS = 3_389_500
/** MOLA elevation range used until a surface reports its own. */
const DEFAULT_HEIGHT_RANGE_METERS = [-8177, 21171] as const
const MARS_RADIUS = 0.8

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uAlbedoTexture;
uniform float uDensity;
uniform float uAxialTilt;
uniform float uBlueAureole;
uniform float uDustAerosol;
uniform float uDustDetail;
uniform float uExposure;
uniform float uHeightScale;
uniform sampler2D uHeightTexture;
uniform float uLongitudeOffset;
uniform sampler2D uNormalTexture;
uniform float uNormalStrength;
uniform float uPhotometricMix;
uniform vec2 uPointer;
uniform float uReliefShadowStrength;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uYaw;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float ATMOSPHERE_THICKNESS = 0.055;
const float MARS_FLATTENING = 0.00589;
const float MARS_RADIUS = ${MARS_RADIUS.toFixed(2)};
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

vec2 sphereUv(vec3 direction) {
  return vec2(
    fract(atan(direction.x, direction.z) / TAU + 0.5),
    clamp(asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5, 0.0, 1.0)
  );
}

vec3 textureDirection(vec3 direction) {
  vec3 tilted = rotateX(direction, uAxialTilt + uPointer.y * 0.07);
  return rotateY(
    tilted,
    uLongitudeOffset + uYaw + uPointer.x * 0.14
  );
}

vec3 inverseTextureDirection(vec3 direction) {
  vec3 unrotated = rotateY(
    direction,
    -(uLongitudeOffset + uYaw + uPointer.x * 0.14)
  );
  return rotateX(unrotated, -(uAxialTilt + uPointer.y * 0.07));
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

float decodeHeight(vec4 packedHeight) {
  float highByte = floor(packedHeight.b * 255.0 + 0.5);
  float lowByte = floor(packedHeight.a * 255.0 + 0.5);
  return (highByte * 256.0 + lowByte) / 65535.0;
}

float sampleHeight(vec3 radialDirection) {
  return decodeHeight(texture(uHeightTexture, sphereUv(textureDirection(radialDirection))));
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

float terrainVisibility(
  vec3 geometricNormal,
  vec3 radialDirection,
  vec3 lightDirection,
  float centerHeight
) {
  float incidentCosine = dot(geometricNormal, lightDirection);
  vec3 tangentLight = lightDirection - geometricNormal * incidentCosine;
  float tangentLength = length(tangentLight);
  if (
    incidentCosine <= 0.0 ||
    tangentLength < 0.0001 ||
    uReliefShadowStrength <= 0.0
  ) {
    return 1.0;
  }

  vec3 marchDirection = tangentLight / tangentLength;
  float raySlope = incidentCosine / tangentLength;
  float texelAngle = TAU / float(textureSize(uHeightTexture, 0).x);
  float maximumTerrainSlope = -1000.0;

  for (int index = 1; index <= 8; index++) {
    float stepIndex = float(index);
    float angularDistance = texelAngle * (1.0 + stepIndex * stepIndex * 0.72);
    vec3 sampleDirection = normalize(
      radialDirection * cos(angularDistance) + marchDirection * sin(angularDistance)
    );
    float sampleHeightValue = sampleHeight(sampleDirection);
    float terrainSlope = (sampleHeightValue - centerHeight) * uHeightScale / angularDistance;
    maximumTerrainSlope = max(maximumTerrainSlope, terrainSlope);
  }

  float softness = 0.006 + 0.65 * fwidth(raySlope);
  float visibility = smoothstep(
    maximumTerrainSlope - 0.008,
    maximumTerrainSlope + softness,
    raySlope
  );
  return mix(1.0, visibility, clamp(uReliefShadowStrength, 0.0, 1.0));
}

float granularPhotometry(
  vec3 normal,
  vec3 lightDirection,
  vec3 viewDirection
) {
  float incidentCosine = max(dot(normal, lightDirection), 0.0);
  float viewCosine = max(dot(normal, viewDirection), 0.0);
  float lommelSeeliger = min(
    (2.0 * incidentCosine) / max(incidentCosine + viewCosine, 0.0001),
    1.3
  );
  float granular = mix(incidentCosine, lommelSeeliger, 0.3);

  float sigmaSquared = 0.3025;
  float coefficientA = 1.0 - 0.5 * sigmaSquared / (sigmaSquared + 0.33);
  float coefficientB = 0.45 * sigmaSquared / (sigmaSquared + 0.09);
  float thetaIncident = acos(clamp(incidentCosine, 0.0, 1.0));
  float thetaView = acos(clamp(viewCosine, 0.0, 1.0));
  float alpha = max(thetaIncident, thetaView);
  float beta = min(thetaIncident, thetaView);
  vec3 tangentLight = lightDirection - normal * incidentCosine;
  vec3 tangentView = viewDirection - normal * viewCosine;
  float azimuth = 0.0;
  if (length(tangentLight) > 0.0001 && length(tangentView) > 0.0001) {
    azimuth = max(dot(normalize(tangentLight), normalize(tangentView)), 0.0);
  }
  float roughDiffuse = incidentCosine * (
    coefficientA + coefficientB * azimuth * sin(alpha) * tan(min(beta, 1.55))
  );
  return mix(granular, roughDiffuse, clamp(uPhotometricMix, 0.0, 1.0));
}

float atmosphereSunVisibility(vec3 point, vec3 lightDirection) {
  float facing = dot(point, lightDirection);
  float closestTravel = max(-facing, 0.0);
  float clearance = length(point + lightDirection * closestTravel) - MARS_RADIUS;
  float geometricVisibility = smoothstep(-0.002, 0.008, clearance);
  float outwardVisibility = smoothstep(0.0, 0.012, facing);
  return max(geometricVisibility, outwardVisibility);
}

float henyeyGreenstein(float cosineAngle, float asymmetry) {
  float g2 = asymmetry * asymmetry;
  return (1.0 - g2) /
    max(pow(1.0 + g2 - 2.0 * asymmetry * cosineAngle, 1.5), 0.001);
}

void integrateAtmosphere(
  vec2 position,
  float surfaceDepth,
  bool hasSurface,
  vec3 lightDirection,
  out vec3 inScattering,
  out float viewTransmission,
  out float atmosphereAlpha
) {
  inScattering = vec3(0.0);
  viewTransmission = 1.0;
  atmosphereAlpha = 0.0;
  if (uDensity <= 0.0) return;

  float atmosphereRadius = MARS_RADIUS * (1.0 + ATMOSPHERE_THICKNESS);
  float radialSquared = dot(position, position);
  if (radialSquared >= atmosphereRadius * atmosphereRadius) return;

  float shellDepth = sqrt(max(atmosphereRadius * atmosphereRadius - radialSquared, 0.0));
  float segmentStart = shellDepth;
  float segmentEnd = hasSurface ? surfaceDepth : -shellDepth;
  float segmentLength = max(segmentStart - segmentEnd, 0.0);
  float stepLength = segmentLength / 6.0;
  float shellThickness = atmosphereRadius - MARS_RADIUS;
  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float opticalDepth = 0.0;
  float phaseCosine = dot(-lightDirection, viewDirection);
  float dustPhase = henyeyGreenstein(phaseCosine, 0.63) * 0.16;

  for (int index = 0; index < 6; index++) {
    float distance = stepLength * (float(index) + 0.5);
    vec3 point = vec3(position, segmentStart - distance);
    float normalizedHeight = max((length(point) - MARS_RADIUS) / shellThickness, 0.0);
    float density = exp(-normalizedHeight * 5.4);
    float normalizedStep = stepLength / max(shellThickness, 0.0001);
    float sampleDepth = density * normalizedStep;
    opticalDepth += sampleDepth;

    vec3 radialDirection = normalize(point);
    float sunlight = atmosphereSunVisibility(point, lightDirection);
    float tangentSun = exp(-abs(dot(radialDirection, lightDirection)) * 11.0);
    float tangentView = pow(1.0 - abs(dot(radialDirection, viewDirection)), 2.0);
    float blueGeometry = tangentSun * tangentView * uBlueAureole * uDustAerosol;
    vec3 warmDust = vec3(0.78, 0.25, 0.09) *
      (0.13 + uDustAerosol * dustPhase);
    vec3 molecular = vec3(0.15, 0.19, 0.24) * 0.018;
    vec3 blueAureole = vec3(0.16, 0.34, 0.68) * blueGeometry * 0.55;
    float accumulatedTransmission = exp(
      -opticalDepth * uDensity * (0.28 + 1.65 * uDustAerosol)
    );
    inScattering += (
      warmDust + molecular + blueAureole
    ) * sampleDepth * sunlight * accumulatedTransmission * uDensity;
  }

  float extinction = opticalDepth * uDensity * (0.28 + 1.65 * uDustAerosol);
  viewTransmission = exp(-extinction);
  atmosphereAlpha = 1.0 - exp(-extinction * 0.72);
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
  float polarRadius = MARS_RADIUS * (1.0 - MARS_FLATTENING);
  vec2 ellipsoidPosition = vec2(position.x / MARS_RADIUS, position.y / polarRadius);
  float ellipsoidDistance = length(ellipsoidPosition);
  float surfaceEdge = max(fwidth(ellipsoidDistance), 0.0005);
  float surfaceCoverage = 1.0 - smoothstep(
    1.0 - surfaceEdge,
    1.0 + surfaceEdge,
    ellipsoidDistance
  );
  bool hasSurface = ellipsoidDistance <= 1.0 + surfaceEdge;
  float surfaceDepth = 0.0;
  vec3 surfaceColor = vec3(0.0);

  if (hasSurface) {
    float depth = sqrt(max(1.0 - dot(ellipsoidPosition, ellipsoidPosition), 0.0));
    vec3 surfacePoint = vec3(
      ellipsoidPosition.x * MARS_RADIUS,
      ellipsoidPosition.y * polarRadius,
      depth * MARS_RADIUS
    );
    surfaceDepth = surfacePoint.z;
    vec3 radialDirection = normalize(surfacePoint / vec3(MARS_RADIUS, polarRadius, MARS_RADIUS));
    vec3 geometricNormal = normalize(surfacePoint / vec3(
      MARS_RADIUS * MARS_RADIUS,
      polarRadius * polarRadius,
      MARS_RADIUS * MARS_RADIUS
    ));
    vec3 mappedDirection = textureDirection(radialDirection);
    vec4 normalData = sampleEquirectangular(uNormalTexture, mappedDirection);
    vec3 tangentNormal = decodeOctahedralNormal(normalData.rg);
    tangentNormal.xy *= uNormalStrength;
    tangentNormal = normalize(tangentNormal);
    vec3 mappedNormal = tangentFrame(mappedDirection) * tangentNormal;
    vec3 terrainNormal = inverseTextureDirection(mappedNormal);
    vec3 shadingNormal = normalize(terrainNormal + geometricNormal - radialDirection);
    vec3 albedo = sampleEquirectangular(uAlbedoTexture, mappedDirection).rgb;

    if (uDustDetail > 0.0) {
      float broad = valueNoise(mappedDirection * 18.0);
      float fine = valueNoise(mappedDirection * 73.0 + broad * 2.4);
      float detail = ((broad - 0.5) * 0.55 + (fine - 0.5) * 0.28) * uDustDetail;
      albedo *= 1.0 + detail;
      albedo += max(detail, 0.0) * vec3(0.035, 0.018, 0.008);
    }

    vec3 viewDirection = vec3(0.0, 0.0, 1.0);
    float geometricIncident = dot(geometricNormal, uSunDirection);
    float terminatorWidth = max(fwidth(geometricIncident), 0.0008);
    float dayVisibility = smoothstep(-terminatorWidth, terminatorWidth, geometricIncident);
    float photometry = granularPhotometry(shadingNormal, uSunDirection, viewDirection);
    float centerHeight = sampleHeight(radialDirection);
    float reliefVisibility = terrainVisibility(
      geometricNormal,
      radialDirection,
      uSunDirection,
      centerHeight
    );
    float directLight = dayVisibility * photometry * reliefVisibility;
    surfaceColor = albedo * mix(0.0015, directLight, dayVisibility);
  }

  vec3 inScattering;
  float viewTransmission;
  float atmosphereAlpha;
  integrateAtmosphere(
    position,
    surfaceDepth,
    hasSurface,
    uSunDirection,
    inScattering,
    viewTransmission,
    atmosphereAlpha
  );

  float atmosphereRadius = MARS_RADIUS * (1.0 + ATMOSPHERE_THICKNESS);
  float atmosphereDistance = length(position) / atmosphereRadius;
  float atmosphereEdge = max(fwidth(atmosphereDistance), 0.0005);
  float atmosphereCoverage = 1.0 - smoothstep(
    1.0 - atmosphereEdge,
    1.0 + atmosphereEdge,
    atmosphereDistance
  );
  atmosphereAlpha *= atmosphereCoverage;
  inScattering *= atmosphereCoverage;

  vec3 premultipliedLinear = surfaceColor * viewTransmission * surfaceCoverage + inScattering;
  float alpha = surfaceCoverage + atmosphereAlpha * (1.0 - surfaceCoverage);
  if (alpha <= 0.0001) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 linearColor = premultipliedLinear / alpha;
  linearColor = filmic(linearColor * uExposure);
  linearColor = pow(linearColor, vec3(1.0 / 2.2));
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  linearColor = clamp(linearColor + dither, 0.0, 1.0);
  fragColor = vec4(linearColor * alpha, alpha);
}
`

function heightScaleFor(range: readonly [number, number]): number {
  return (range[1] - range[0]) / MARS_MEAN_RADIUS_METERS
}

const spec: OrbRendererSpec<MartianResources, MartianFrameSettings, MartianSurface> = {
  label: 'Mars',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Mars')
    return {
      albedoTexture: createTexture(gl, 'Mars albedo', {
        internalFormat: gl.SRGB8_ALPHA8,
        placeholder: [255, 255, 255, 255],
      }),
      heightScale: heightScaleFor(DEFAULT_HEIGHT_RANGE_METERS),
      heightTexture: createTexture(gl, 'Mars height', {
        magFilter: gl.NEAREST,
        minFilter: gl.NEAREST,
        placeholder: [128, 128, 128, 128],
      }),
      longitudeOffset: 0,
      normalTexture: createTexture(gl, 'Mars normal', { placeholder: [128, 128, 128, 128] }),
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Mars'),
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
    withUnpackState(gl, { flipY: true, premultiplyAlpha: false }, () => {
      uploadImage(gl, resources.albedoTexture, surface.albedo, {
        internalFormat: gl.SRGB8_ALPHA8,
      })
      uploadImage(gl, resources.normalTexture, surface.normalHeight)
      uploadImage(gl, resources.heightTexture, surface.normalHeight, { mipmaps: false })
    })
    resources.heightScale = heightScaleFor(surface.heightRangeMeters)
    resources.longitudeOffset = degreesToRadians(surface.longitudeOffsetDegrees ?? 0)
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
    gl.uniform1f(uniforms.uDensity, settings.density)
    gl.uniform1f(uniforms.uAxialTilt, degreesToRadians(settings.tilt))
    gl.uniform1f(uniforms.uBlueAureole, settings.blueAureole)
    gl.uniform1f(uniforms.uDustAerosol, settings.dustAerosol)
    gl.uniform1f(uniforms.uDustDetail, settings.dustDetail)
    gl.uniform1f(uniforms.uExposure, settings.exposure)
    gl.uniform1f(uniforms.uHeightScale, resources.heightScale)
    gl.uniform1f(uniforms.uLongitudeOffset, resources.longitudeOffset)
    gl.uniform1f(uniforms.uNormalStrength, settings.normalStrength)
    gl.uniform1f(uniforms.uPhotometricMix, settings.photometricMix)
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(uniforms.uReliefShadowStrength, settings.reliefShadowStrength)
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform3f(
      uniforms.uSunDirection,
      ...sunDirection(settings.sunAzimuth, settings.sunElevation),
    )
    gl.uniform1f(uniforms.uYaw, degreesToRadians(settings.yaw + elapsed * settings.spin))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function MartianOrbEffect({
  blueAureole = 0.12,
  className,
  composition,
  density = 0.22,
  dustAerosol = 0.36,
  dustDetail = 0.1,
  exposure = 1.06,
  lean = true,
  normalStrength = 1.6,
  onError,
  paused,
  photometricMix = 0.45,
  reliefShadowStrength = 1,
  source,
  spin = 1.2,
  style,
  sunAzimuth = -48,
  sunElevation = 9,
  tilt = 8,
  viewport,
  yaw = 0,
}: MartianOrbEffectProps) {
  const settings: MartianFrameSettings = {
    blueAureole,
    density,
    dustAerosol,
    dustDetail,
    exposure,
    lean,
    normalStrength,
    photometricMix,
    reliefShadowStrength,
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
