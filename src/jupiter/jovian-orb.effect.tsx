// Hosted texture:
// https://solaris.cuvii.dev/textures/v1/jupiter/jupiter-albedo-2048.webp
// Original texture:
// https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2019/08/STScI-01EVSV9A3VN7VYXN5H6Z1GDG93.tif/jcr:content/renditions/Full%20Res.png

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

export type JovianSurface = {
  /** Equirectangular sRGB cloud albedo. */
  albedo: TexImageSource
  /** Great Red Spot centre in degrees; omit to disable the vortex warp. */
  grsCenter?: readonly [longitudeDegrees: number, latitudeDegrees: number]
  /** Great Red Spot angular radii in degrees. Only used with `grsCenter`. */
  grsRadii?: readonly [longitudeDegrees: number, latitudeDegrees: number]
  longitudeOffsetDegrees?: number
}

export type JovianOrbSource = OrbSource<JovianSurface>

export type JovianOrbEffectProps = OrbCanvasProps &
  OrbPoseProps &
  OrbLightingProps & {
    /** Zonal cloud advection speed in degrees per second; also drives the vortex. @default 3.2 */
    bandDrift?: number
    /** Blend from Lambert (0) towards Lommel–Seeliger cloud photometry (1). @default 0.35 */
    cloudPhotometricMix?: number
    /** Procedural cloud filament contrast. Range 0–0.5. @default 0.11 */
    detailIntensity?: number
    /** Latitudinal frequency multiplier of the procedural detail. Range 0.05–3. @default 1 */
    detailScale?: number
    /** Linear scene gain before tone mapping. @default 1.05 */
    exposure?: number
    /** Polar flattening in percent of the equatorial radius. Range 0–20. @default 6.5 */
    flattening?: number
    /** Latitude-dependent jet stream differential. Range 0–2. @default 0.65 */
    jetStrength?: number
    /** Warm haze along the sunlit limb. Range 0–1. @default 0.16 */
    limbHaze?: number
    source: JovianOrbSource
    /** Rotation of the Great Red Spot cloud field. Range 0–1. @default 0.42 */
    vortexStrength?: number
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAlbedoTexture',
  'uBandDrift',
  'uCloudPhotometricMix',
  'uDetailIntensity',
  'uDetailScale',
  'uExposure',
  'uFlattening',
  'uGrsCenter',
  'uGrsRadii',
  'uJetStrength',
  'uLimbHaze',
  'uLongitudeOffset',
  'uPointer',
  'uSourceReady',
  'uSunDirection',
  'uTilt',
  'uTime',
  'uVortexStrength',
  'uYaw',
] as const

type JovianResources = {
  albedoTexture: WebGLTexture
  /** Radians, derived from the uploaded surface. */
  grsCenter: readonly [number, number]
  /** Radians, derived from the uploaded surface. */
  grsRadii: readonly [number, number]
  longitudeOffset: number
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

type JovianFrameSettings = {
  bandDrift: number
  cloudPhotometricMix: number
  detailIntensity: number
  detailScale: number
  exposure: number
  flattening: number
  jetStrength: number
  lean: boolean
  limbHaze: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  tilt: number
  yaw: number
  vortexStrength: number
}

const JUPITER_RADIUS = 0.82

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uAlbedoTexture;
uniform float uCloudPhotometricMix;
uniform float uDetailIntensity;
uniform float uDetailScale;
uniform float uBandDrift;
uniform float uExposure;
uniform vec2 uGrsCenter;
uniform vec2 uGrsRadii;
uniform float uJetStrength;
uniform float uLimbHaze;
uniform float uLongitudeOffset;
uniform float uFlattening;
uniform vec2 uPointer;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uTilt;
uniform float uYaw;
uniform float uTime;
uniform float uVortexStrength;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float JUPITER_RADIUS = ${JUPITER_RADIUS.toFixed(2)};
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

vec3 textureDirection(vec3 radialDirection) {
  vec3 tilted = rotateX(radialDirection, uTilt + uPointer.y * 0.12);
  return rotateY(tilted, uLongitudeOffset + uYaw + uPointer.x * 0.18);
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

float zonalWind(float latitude) {
  float normalizedLatitude = latitude / (0.5 * PI);
  float equatorialJet = 1.05 * exp(-normalizedLatitude * normalizedLatitude * 42.0);
  float alternatingJets = sin(latitude * 18.0 + 0.35) * 0.62 +
    sin(latitude * 34.0 - 0.7) * 0.2;
  float polarFalloff = pow(max(cos(latitude), 0.0), 0.45);
  return (equatorialJet + alternatingJets) * polarFalloff;
}

vec2 vortexCoordinates(float longitude, float latitude) {
  if (uGrsRadii.x <= 0.0001 || uGrsRadii.y <= 0.0001 || uVortexStrength <= 0.0) {
    return vec2(longitude, latitude);
  }

  float centerCosine = max(cos(uGrsCenter.y), 0.1);
  vec2 radii = vec2(uGrsRadii.x * centerCosine, uGrsRadii.y);
  vec2 delta = vec2(wrapAngle(longitude - uGrsCenter.x) * centerCosine, latitude - uGrsCenter.y);
  vec2 local = delta / radii;
  float radius = length(local);
  float influence = 1.0 - smoothstep(0.25, 1.65, radius);
  float angle = -uTime * uBandDrift * 4.8 * uVortexStrength * influence;
  vec2 warpedDelta = rotate2d(local, angle) * radii;
  return vec2(
    uGrsCenter.x + warpedDelta.x / centerCosine,
    uGrsCenter.y + warpedDelta.y
  );
}

float weatherDetail(float longitude, float latitude) {
  vec2 weather = vortexCoordinates(longitude, latitude);
  float advectedLongitude = weather.x +
    uTime * uBandDrift * uJetStrength * zonalWind(weather.y);
  float scale = max(uDetailScale, 0.05);

  vec3 broadDomain = vec3(
    cos(advectedLongitude) * 2.4,
    sin(advectedLongitude) * 2.4,
    weather.y * 18.0 * scale
  );
  float broad = valueNoise(broadDomain);
  float warpedLatitude = weather.y + (broad - 0.5) * 0.028;

  vec3 filamentDomain = vec3(
    cos(advectedLongitude * 3.0) * 3.2,
    sin(advectedLongitude * 3.0) * 3.2,
    warpedLatitude * 58.0 * scale
  );
  float filament = valueNoise(filamentDomain);
  float micro = valueNoise(vec3(
    cos(advectedLongitude * 7.0) * 4.3,
    sin(advectedLongitude * 7.0) * 4.3,
    warpedLatitude * 108.0 * scale + broad * 2.0
  ));
  float strands = sin(warpedLatitude * 96.0 * scale + broad * 5.5 + filament * 3.0);
  float polarFade = smoothstep(0.04, 0.22, cos(weather.y));
  return ((filament - 0.5) * 0.82 + (micro - 0.5) * 0.28 + strands * 0.15) *
    polarFade;
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
  float polarRadius = JUPITER_RADIUS * (1.0 - clamp(uFlattening, 0.0, 0.2));
  vec2 ellipsoidPosition = vec2(position.x / JUPITER_RADIUS, position.y / polarRadius);
  float radialDistance = length(ellipsoidPosition);
  float edgeWidth = max(fwidth(radialDistance), 0.0005);
  float coverage = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, radialDistance);
  if (coverage <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  float depth = sqrt(max(1.0 - dot(ellipsoidPosition, ellipsoidPosition), 0.0));
  vec3 surfacePoint = vec3(
    ellipsoidPosition.x * JUPITER_RADIUS,
    ellipsoidPosition.y * polarRadius,
    depth * JUPITER_RADIUS
  );
  vec3 radialDirection = normalize(surfacePoint);
  vec3 geometricNormal = normalize(vec3(
    ellipsoidPosition.x / JUPITER_RADIUS,
    ellipsoidPosition.y / polarRadius,
    depth / JUPITER_RADIUS
  ));
  vec3 mappedDirection = textureDirection(radialDirection);
  vec3 albedo = sampleEquirectangular(uAlbedoTexture, mappedDirection).rgb;

  float longitude = atan(mappedDirection.x, mappedDirection.z);
  float latitude = asin(clamp(mappedDirection.y, -1.0, 1.0));
  float detail = weatherDetail(longitude, latitude) * uDetailIntensity;
  albedo *= 1.0 + detail;
  albedo += detail * vec3(0.045, 0.028, 0.012);

  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float viewCosine = max(dot(geometricNormal, viewDirection), 0.0);
  float incident = dot(geometricNormal, uSunDirection);
  float terminatorWidth = max(fwidth(incident) * 1.5, 0.0008);
  float dayVisibility = smoothstep(-terminatorWidth, terminatorWidth, incident);
  float incidentCosine = max(incident, 0.0);
  float lommelSeeliger = min(
    (2.0 * incidentCosine) / max(incidentCosine + viewCosine, 0.0001),
    1.25
  );
  float cloudPhotometry = mix(
    incidentCosine,
    lommelSeeliger,
    clamp(uCloudPhotometricMix, 0.0, 1.0)
  );
  float phase = max(dot(uSunDirection, viewDirection), 0.0);
  float backscatter = 1.0 + 0.14 * pow(phase, 4.0);
  float reflectedLight = cloudPhotometry * backscatter;
  float lighting = mix(0.004, reflectedLight, dayVisibility);

  vec3 linearColor = albedo * lighting;
  float limbPath = pow(1.0 - viewCosine, 4.0);
  float hazeVisibility = dayVisibility * smoothstep(-0.18, 0.32, incident);
  linearColor += vec3(0.88, 0.79, 0.67) * limbPath * hazeVisibility * uLimbHaze * 0.32;
  linearColor = filmic(linearColor * uExposure);
  linearColor = pow(linearColor, vec3(1.0 / 2.2));
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  linearColor = clamp(linearColor + dither, 0.0, 1.0);
  fragColor = vec4(linearColor * coverage, coverage);
}
`

const spec: OrbRendererSpec<JovianResources, JovianFrameSettings, JovianSurface> = {
  label: 'Jupiter',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Jupiter')
    return {
      albedoTexture: createTexture(gl, 'Jupiter albedo', {
        internalFormat: gl.SRGB8_ALPHA8,
        placeholder: [255, 255, 255, 255],
      }),
      grsCenter: [0, 0],
      grsRadii: [0, 0],
      longitudeOffset: 0,
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Jupiter'),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteTexture(resources.albedoTexture)
    gl.deleteProgram(resources.program)
    gl.deleteVertexArray(resources.vertexArray)
  },
  upload(gl, resources, surface) {
    withUnpackState(gl, { flipY: true, premultiplyAlpha: false }, () => {
      uploadImage(gl, resources.albedoTexture, surface.albedo, {
        internalFormat: gl.SRGB8_ALPHA8,
      })
    })
    resources.longitudeOffset = degreesToRadians(surface.longitudeOffsetDegrees ?? 0)
    resources.grsCenter = surface.grsCenter
      ? [degreesToRadians(surface.grsCenter[0]), degreesToRadians(surface.grsCenter[1])]
      : [0, 0]
    // Radii only matter when a centre is given; zero radii disable the vortex warp.
    resources.grsRadii =
      surface.grsCenter && surface.grsRadii
        ? [degreesToRadians(surface.grsRadii[0]), degreesToRadians(surface.grsRadii[1])]
        : [0, 0]
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
    gl.bindTexture(gl.TEXTURE_2D, resources.albedoTexture)
    gl.uniform1i(uniforms.uAlbedoTexture, 0)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uCloudPhotometricMix, settings.cloudPhotometricMix)
    gl.uniform1f(uniforms.uDetailIntensity, settings.detailIntensity)
    gl.uniform1f(uniforms.uDetailScale, settings.detailScale)
    gl.uniform1f(uniforms.uBandDrift, degreesToRadians(settings.bandDrift))
    gl.uniform1f(uniforms.uExposure, settings.exposure)
    gl.uniform2f(uniforms.uGrsCenter, ...resources.grsCenter)
    gl.uniform2f(uniforms.uGrsRadii, ...resources.grsRadii)
    gl.uniform1f(uniforms.uJetStrength, settings.jetStrength)
    gl.uniform1f(uniforms.uLimbHaze, settings.limbHaze)
    gl.uniform1f(uniforms.uLongitudeOffset, resources.longitudeOffset)
    gl.uniform1f(uniforms.uFlattening, settings.flattening / 100)
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform3f(
      uniforms.uSunDirection,
      ...sunDirection(settings.sunAzimuth, settings.sunElevation),
    )
    gl.uniform1f(uniforms.uTilt, degreesToRadians(settings.tilt))
    gl.uniform1f(uniforms.uYaw, degreesToRadians(settings.yaw + elapsed * settings.spin))
    gl.uniform1f(uniforms.uTime, elapsed)
    gl.uniform1f(uniforms.uVortexStrength, settings.vortexStrength)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function JovianOrbEffect({
  bandDrift = 3.2,
  className,
  cloudPhotometricMix = 0.35,
  composition,
  detailIntensity = 0.11,
  detailScale = 1,
  exposure = 1.05,
  flattening = 6.5,
  jetStrength = 0.65,
  lean = true,
  limbHaze = 0.16,
  onError,
  paused,
  source,
  spin = 1.4,
  style,
  sunAzimuth = -32,
  sunElevation = 12,
  tilt = 0,
  viewport,
  yaw = 0,
  vortexStrength = 0.42,
}: JovianOrbEffectProps) {
  const settings: JovianFrameSettings = {
    bandDrift,
    cloudPhotometricMix,
    detailIntensity,
    detailScale,
    exposure,
    flattening,
    jetStrength,
    lean,
    limbHaze,
    spin,
    sunAzimuth,
    sunElevation,
    tilt,
    yaw,
    vortexStrength,
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
