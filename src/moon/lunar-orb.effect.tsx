// Hosted textures:
// https://solaris.cuvii.dev/textures/v1/moon/moon-albedo-2048.webp
// https://solaris.cuvii.dev/textures/v1/moon/moon-normal-height-2048.webp
// Original textures:
// https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif
// https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16.tif

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

export type LunarSurface = {
  /** Equirectangular sRGB albedo. */
  albedo: TexImageSource
  /** Height-channel range as a fraction of the lunar radius. Defaults to 22 km / 1737.4 km. */
  heightScale?: number
  longitudeOffsetDegrees?: number
  /** RGB: tangent-space normal. A: normalised height. */
  normalHeight: TexImageSource
}

export type LunarOrbSource = OrbSource<LunarSurface>

export type LunarOrbEffectProps = OrbCanvasProps &
  OrbPoseProps &
  OrbLightingProps & {
    /** Limb glow strength outside the disc. Range 0–2. @default 0 */
    bloomIntensity?: number
    /** Limb glow extent as a fraction of the lunar radius. Range 0–0.5. @default 0.08 */
    bloomRadius?: number
    /** Glow tint from neutral white (0) to warm amber (1). @default 0.35 */
    bloomWarmth?: number
    /** Earthshine on the night side, in thousandths of full sunlight. Range 0–40. @default 6 */
    earthshineIntensity?: number
    /** Linear scene gain before tone mapping. @default 0.72 */
    exposure?: number
    /** Tangent-space normal map strength. Range 0–3. @default 0.85 */
    normalStrength?: number
    /** Opposition surge brightening near full phase. Range 0–1. @default 0.25 */
    oppositionStrength?: number
    /** Angular width of the opposition surge in half-phase tangent units. Range 0.005–0.2. @default 0.035 */
    oppositionWidth?: number
    /** Blend from Lommel–Seeliger (0) towards Lambert (1). @default 0.14 */
    photometricMix?: number
    /** Terrain self-shadowing from the height channel. Range 0–1. @default 0.58 */
    reliefShadowStrength?: number
    source: LunarOrbSource
    /** Glare bleeding across the sunlit disc. Range 0–1. @default 0 */
    veilingGlare?: number
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAlbedoTexture',
  'uBloomIntensity',
  'uBloomRadius',
  'uBloomWarmth',
  'uEarthshineIntensity',
  'uExposure',
  'uHeightScale',
  'uLongitudeOffset',
  'uNormalHeightTexture',
  'uNormalStrength',
  'uOppositionStrength',
  'uOppositionWidth',
  'uPhotometricMix',
  'uPointer',
  'uReliefShadowStrength',
  'uSourceReady',
  'uSunDirection',
  'uTilt',
  'uVeilingGlare',
  'uYaw',
] as const

type LunarResources = {
  albedoTexture: WebGLTexture
  /** Fraction of the lunar radius, derived from the uploaded surface. */
  heightScale: number
  longitudeOffset: number
  normalHeightTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

type LunarFrameSettings = {
  bloomIntensity: number
  bloomRadius: number
  bloomWarmth: number
  earthshineIntensity: number
  exposure: number
  lean: boolean
  normalStrength: number
  oppositionStrength: number
  oppositionWidth: number
  photometricMix: number
  reliefShadowStrength: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  tilt: number
  veilingGlare: number
  yaw: number
}

const DEFAULT_HEIGHT_SCALE = 22 / 1737.4
const MOON_RADIUS = 0.82

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uAlbedoTexture;
uniform float uBloomIntensity;
uniform float uBloomRadius;
uniform float uBloomWarmth;
uniform float uEarthshineIntensity;
uniform float uExposure;
uniform float uHeightScale;
uniform float uLongitudeOffset;
uniform sampler2D uNormalHeightTexture;
uniform float uNormalStrength;
uniform float uOppositionStrength;
uniform float uOppositionWidth;
uniform float uPhotometricMix;
uniform vec2 uPointer;
uniform float uReliefShadowStrength;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uTilt;
uniform float uYaw;
uniform float uVeilingGlare;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float MOON_RADIUS = ${MOON_RADIUS.toFixed(2)};
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

vec3 textureDirection(vec3 surfaceNormal) {
  vec3 tilted = rotateX(surfaceNormal, uTilt + uPointer.y * 0.1);
  return rotateY(tilted, uLongitudeOffset + uYaw + uPointer.x * 0.16);
}

vec2 sphereUv(vec3 direction) {
  return vec2(
    fract(atan(direction.x, direction.z) / TAU + 0.5),
    clamp(asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5, 0.0, 1.0)
  );
}

vec4 sampleEquirectangular(
  sampler2D image,
  vec2 uv,
  vec2 gradientX,
  vec2 gradientY
) {
  return textureGrad(image, uv, gradientX, gradientY);
}

float sampleHeightLod(vec3 surfaceNormal, float lod) {
  return textureLod(uNormalHeightTexture, sphereUv(textureDirection(surfaceNormal)), lod).a;
}

mat3 tangentFrame(vec3 surfaceNormal) {
  float horizontalLength = length(surfaceNormal.xz);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  if (horizontalLength > 0.0001) {
    tangent = vec3(surfaceNormal.z, 0.0, -surfaceNormal.x) / horizontalLength;
  }
  vec3 bitangent = normalize(cross(surfaceNormal, tangent));
  return mat3(tangent, bitangent, surfaceNormal);
}

float lunarDiskLaw(float incidentCosine, float viewCosine) {
  float lommelSeeliger = min(
    (2.0 * incidentCosine) / max(incidentCosine + viewCosine, 0.0001),
    1.35
  );
  return mix(lommelSeeliger, incidentCosine, uPhotometricMix);
}

float terrainVisibility(
  vec3 geometricNormal,
  vec3 lightDirection,
  float centerHeight,
  vec2 textureGradientX,
  vec2 textureGradientY,
  float raySlopeFootprint
) {
  float incidentCosine = dot(geometricNormal, lightDirection);
  vec3 tangentLight = lightDirection - geometricNormal * incidentCosine;
  float tangentLength = length(tangentLight);
  if (incidentCosine <= 0.0 || tangentLength < 0.0001 || uReliefShadowStrength <= 0.0) {
    return 1.0;
  }

  vec3 marchDirection = tangentLight / tangentLength;
  float raySlope = incidentCosine / tangentLength;
  float texelAngle = TAU / float(textureSize(uNormalHeightTexture, 0).x);
  float maxTerrainSlope = -1000.0;

  for (int index = 1; index <= 6; index++) {
    float stepIndex = float(index);
    float angularDistance = texelAngle * (1.2 + stepIndex * stepIndex * 0.95);
    vec3 sampleNormal = normalize(
      geometricNormal * cos(angularDistance) + marchDirection * sin(angularDistance)
    );
    float lod = max(log2(stepIndex * 0.72), 0.0);
    float sampleHeight = sampleHeightLod(sampleNormal, lod);
    float terrainSlope = (sampleHeight - centerHeight) * uHeightScale / angularDistance;
    maxTerrainSlope = max(maxTerrainSlope, terrainSlope);
  }

  float softness = 0.008 + 0.75 * raySlopeFootprint;
  float visibility = smoothstep(maxTerrainSlope - 0.012, maxTerrainSlope + softness, raySlope);
  vec2 textureSizePixels = vec2(textureSize(uNormalHeightTexture, 0));
  vec2 footprint = max(abs(textureGradientX), abs(textureGradientY)) * textureSizePixels;
  float footprintFade = 1.0 - smoothstep(3.0, 9.0, max(footprint.x, footprint.y));
  return mix(1.0, visibility, uReliefShadowStrength * footprintFade);
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
  float radialDistance = length(position);
  float edgeWidth = max(fwidth(radialDistance), 0.0005);
  float coverage = 1.0 - smoothstep(MOON_RADIUS - edgeWidth, MOON_RADIUS + edgeWidth, radialDistance);
  vec2 unprojectedSpherePosition = position / MOON_RADIUS;
  float unprojectedRadius = length(unprojectedSpherePosition);
  float projectionScale = min(0.9999 / max(unprojectedRadius, 0.9999), 1.0);
  vec2 spherePosition = unprojectedSpherePosition * projectionScale;
  vec3 geometricNormal = normalize(vec3(
    spherePosition,
    sqrt(max(1.0 - dot(spherePosition, spherePosition), 0.0))
  ));
  vec3 mappedDirection = textureDirection(geometricNormal);
  vec2 surfaceUv = sphereUv(mappedDirection);
  vec3 mappedDirectionDx = normalize(mappedDirection + dFdx(mappedDirection));
  vec3 mappedDirectionDy = normalize(mappedDirection + dFdy(mappedDirection));
  vec2 textureGradientX = sphereUv(mappedDirectionDx) - surfaceUv;
  vec2 textureGradientY = sphereUv(mappedDirectionDy) - surfaceUv;
  textureGradientX.x -= round(textureGradientX.x);
  textureGradientY.x -= round(textureGradientY.x);

  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float geometricIncident = dot(geometricNormal, uSunDirection);
  float terminatorWidth = max(
    abs(dFdx(geometricIncident)) + abs(dFdy(geometricIncident)),
    0.0008
  );
  vec3 tangentLight = uSunDirection - geometricNormal * geometricIncident;
  float terrainRaySlope = geometricIncident / max(length(tangentLight), 0.0001);
  float terrainRaySlopeFootprint = abs(dFdx(terrainRaySlope)) + abs(dFdy(terrainRaySlope));

  float phaseAngle = acos(clamp(dot(uSunDirection, viewDirection), -1.0, 1.0));
  float oppositionLobe = 1.0 + uOppositionStrength /
    (1.0 + tan(phaseAngle * 0.5) / max(uOppositionWidth, 0.0001));

  vec2 haloDirection = radialDistance > 0.0001 ? position / radialDistance : vec2(1.0, 0.0);
  vec2 haloSpherePosition = haloDirection * 0.9;
  vec3 haloSurfaceNormal = vec3(
    haloSpherePosition,
    sqrt(max(1.0 - dot(haloSpherePosition, haloSpherePosition), 0.0))
  );
  float haloIncident = dot(haloSurfaceNormal, uSunDirection);
  float haloPhotometry = lunarDiskLaw(
    max(haloIncident, 0.0),
    max(haloSurfaceNormal.z, 0.0)
  );
  float haloSource = smoothstep(-0.04, 0.08, haloIncident) * haloPhotometry *
    smoothstep(-0.15, 0.35, uSunDirection.z) * sqrt(max(uExposure, 0.0));
  float bloomWidth = max(uBloomRadius * MOON_RADIUS, edgeWidth * 2.0);
  float outsideDistance = max(radialDistance - MOON_RADIUS, 0.0);
  float bloomProfile = 0.68 * exp(-outsideDistance / max(bloomWidth * 0.22, 0.0001)) +
    0.32 * exp(-outsideDistance / max(bloomWidth, 0.0001));
  float haloAlpha = clamp(
    bloomProfile * max(uBloomIntensity, 0.0) * haloSource,
    0.0,
    0.92
  ) * (1.0 - coverage);
  vec3 bloomColor = mix(
    vec3(1.0),
    vec3(1.0, 0.72, 0.38),
    clamp(uBloomWarmth, 0.0, 1.0)
  );
  vec3 haloDisplayColor = pow(filmic(bloomColor * 1.3), vec3(1.0 / 2.2));

  if (coverage <= 0.0 && haloAlpha < 0.001) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 displayColor = vec3(0.0);
  if (coverage > 0.0) {
    vec4 normalHeight = sampleEquirectangular(
      uNormalHeightTexture,
      surfaceUv,
      textureGradientX,
      textureGradientY
    );
    vec3 tangentNormal = normalHeight.rgb * 2.0 - 1.0;
    tangentNormal.xy *= uNormalStrength;
    tangentNormal = normalize(tangentNormal);
    vec3 shadingNormal = normalize(tangentFrame(geometricNormal) * tangentNormal);
    vec3 albedo = sampleEquirectangular(
      uAlbedoTexture,
      surfaceUv,
      textureGradientX,
      textureGradientY
    ).rgb;
    float geometricSunlight = smoothstep(
      -terminatorWidth,
      terminatorWidth,
      geometricIncident
    );
    float incidentCosine = max(dot(shadingNormal, uSunDirection), 0.0);
    float viewCosine = max(dot(shadingNormal, viewDirection), 0.0);
    float photometry = lunarDiskLaw(incidentCosine, viewCosine);
    float reliefVisibility = terrainVisibility(
      geometricNormal,
      uSunDirection,
      normalHeight.a,
      textureGradientX,
      textureGradientY,
      terrainRaySlopeFootprint
    );
    float directLight = geometricSunlight * photometry * reliefVisibility * oppositionLobe;

    vec3 earthDirection = normalize(vec3(0.16, -0.1, 1.0));
    float earthIncident = max(dot(shadingNormal, earthDirection), 0.0);
    float earthGeometry = smoothstep(
      -terminatorWidth,
      terminatorWidth,
      dot(geometricNormal, earthDirection)
    );
    float earthshine = uEarthshineIntensity * earthGeometry *
      lunarDiskLaw(earthIncident, viewCosine);

    vec3 linearColor = albedo * (directLight + earthshine) * uExposure;
    linearColor += bloomColor * max(uVeilingGlare, 0.0) * haloSource *
      (0.22 + directLight * 0.78);
    linearColor = filmic(linearColor);
    linearColor = pow(linearColor, vec3(1.0 / 2.2));
    float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    displayColor = clamp(linearColor + dither, 0.0, 1.0);
  }

  vec3 premultiplied = displayColor * coverage + haloDisplayColor * haloAlpha;
  fragColor = vec4(premultiplied, coverage + haloAlpha);
}
`

const spec: OrbRendererSpec<LunarResources, LunarFrameSettings, LunarSurface> = {
  label: 'Moon',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Moon')
    return {
      albedoTexture: createTexture(gl, 'Moon albedo', { placeholder: [255, 255, 255, 255] }),
      heightScale: DEFAULT_HEIGHT_SCALE,
      longitudeOffset: 0,
      normalHeightTexture: createTexture(gl, 'Moon normal', { placeholder: [128, 128, 255, 128] }),
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Moon'),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteTexture(resources.albedoTexture)
    gl.deleteTexture(resources.normalHeightTexture)
    gl.deleteProgram(resources.program)
    gl.deleteVertexArray(resources.vertexArray)
  },
  upload(gl, resources, surface) {
    withUnpackState(gl, { flipY: true, premultiplyAlpha: false }, () => {
      uploadImage(gl, resources.albedoTexture, surface.albedo, {
        internalFormat: gl.SRGB8_ALPHA8,
      })
      uploadImage(gl, resources.normalHeightTexture, surface.normalHeight)
    })
    resources.heightScale = surface.heightScale ?? DEFAULT_HEIGHT_SCALE
    resources.longitudeOffset = degreesToRadians(surface.longitudeOffsetDegrees ?? 0)
  },
  isAnimated: (settings) => settings.spin !== 0,
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
    gl.bindTexture(gl.TEXTURE_2D, resources.normalHeightTexture)
    gl.uniform1i(uniforms.uNormalHeightTexture, 1)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uBloomIntensity, settings.bloomIntensity)
    gl.uniform1f(uniforms.uBloomRadius, settings.bloomRadius)
    gl.uniform1f(uniforms.uBloomWarmth, settings.bloomWarmth)
    // The prop is expressed in thousandths of full sunlight; the shader wants a fraction.
    gl.uniform1f(uniforms.uEarthshineIntensity, settings.earthshineIntensity / 1000)
    gl.uniform1f(uniforms.uExposure, settings.exposure)
    gl.uniform1f(uniforms.uHeightScale, resources.heightScale)
    gl.uniform1f(uniforms.uLongitudeOffset, resources.longitudeOffset)
    gl.uniform1f(uniforms.uNormalStrength, settings.normalStrength)
    gl.uniform1f(uniforms.uOppositionStrength, settings.oppositionStrength)
    gl.uniform1f(uniforms.uOppositionWidth, settings.oppositionWidth)
    gl.uniform1f(uniforms.uPhotometricMix, settings.photometricMix)
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(uniforms.uReliefShadowStrength, settings.reliefShadowStrength)
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform3f(
      uniforms.uSunDirection,
      ...sunDirection(settings.sunAzimuth, settings.sunElevation),
    )
    gl.uniform1f(uniforms.uTilt, degreesToRadians(settings.tilt))
    gl.uniform1f(uniforms.uVeilingGlare, settings.veilingGlare)
    gl.uniform1f(uniforms.uYaw, degreesToRadians(settings.yaw + elapsed * settings.spin))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function LunarOrbEffect({
  bloomIntensity = 0,
  bloomRadius = 0.08,
  bloomWarmth = 0.35,
  className,
  composition,
  earthshineIntensity = 6,
  exposure = 0.72,
  lean = true,
  normalStrength = 0.85,
  onError,
  oppositionStrength = 0.25,
  oppositionWidth = 0.035,
  paused,
  photometricMix = 0.14,
  reliefShadowStrength = 0.58,
  source,
  spin = 0.7,
  style,
  sunAzimuth = -48,
  sunElevation = 16,
  tilt = 0,
  veilingGlare = 0,
  viewport,
  yaw = 0,
}: LunarOrbEffectProps) {
  const settings: LunarFrameSettings = {
    bloomIntensity,
    bloomRadius,
    bloomWarmth,
    earthshineIntensity,
    exposure,
    lean,
    normalStrength,
    oppositionStrength,
    oppositionWidth,
    photometricMix,
    reliefShadowStrength,
    spin,
    sunAzimuth,
    sunElevation,
    tilt,
    veilingGlare,
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
