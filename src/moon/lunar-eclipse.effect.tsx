'use client'

import type { LunarSurface } from './lunar-orb.effect'
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
  uploadImage,
  withUnpackState,
} from '../internal/webgl'
import type { OrbCanvasProps, OrbPoseProps } from '../orb'

export type LunarEclipseSource = OrbSource<LunarSurface>

export type LunarEclipseEffectProps = OrbCanvasProps &
  Omit<OrbPoseProps, 'spin'> & {
    /** Optical depth of Earth's atmosphere along the refracted path; reddens the umbra. Range 0–4. @default 1.8 */
    atmosphericOpticalDepth?: number
    /** Linear scene gain before tone mapping. @default 1.11 */
    exposure?: number
    /** Blue limb glow strength where the Moon is still sunlit. Range 0–4. @default 2.1 */
    haloIntensity?: number
    /** Limb glow extent as a fraction of the lunar radius. Range 0–1. @default 0.4 */
    haloWidth?: number
    /** Tangent-space normal map strength. Range 0–3. @default 1.13 */
    normalStrength?: number
    /** Width of the penumbral gradient in lunar radii. Range 0.1–3. @default 1.15 */
    penumbraWidth?: number
    /** Sunlight refracted through Earth's atmosphere into the umbra. Range 0–4. @default 1.62 */
    refractedLightIntensity?: number
    /** Terrain self-shadowing from the height channel. Range 0–1. @default 0.42 */
    reliefShadowStrength?: number
    source: LunarEclipseSource
    /**
     * Apparent Sun direction around the vertical axis in degrees, relative to
     * the Earth–Moon line. Earth's shadow falls opposite: positive values push
     * the shadow centre left. 0 with `sunElevation` 0 is a central eclipse.
     * @default -16
     */
    sunAzimuth?: number
    /**
     * Apparent Sun height in degrees relative to the Earth–Moon line. Positive
     * values push the shadow centre down. @default 37
     */
    sunElevation?: number
    /** Radius of the umbra in lunar radii. Range 0.5–4. @default 2.2 */
    umbraRadius?: number
  }

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uAlbedoTexture',
  'uAtmosphericOpticalDepth',
  'uExposure',
  'uHaloIntensity',
  'uHaloWidth',
  'uHeightScale',
  'uLongitudeOffset',
  'uNormalHeightTexture',
  'uNormalStrength',
  'uPenumbraWidth',
  'uPointer',
  'uRefractedLightIntensity',
  'uReliefShadowStrength',
  'uShadowOffset',
  'uSourceReady',
  'uTilt',
  'uUmbraRadius',
  'uYaw',
] as const

type LunarEclipseResources = {
  albedoTexture: WebGLTexture
  /** Fraction of the lunar radius, derived from the uploaded surface. */
  heightScale: number
  longitudeOffset: number
  normalHeightTexture: WebGLTexture
  program: WebGLProgram
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

type LunarEclipseFrameSettings = {
  atmosphericOpticalDepth: number
  exposure: number
  haloIntensity: number
  haloWidth: number
  lean: boolean
  normalStrength: number
  penumbraWidth: number
  refractedLightIntensity: number
  reliefShadowStrength: number
  sunAzimuth: number
  sunElevation: number
  tilt: number
  umbraRadius: number
  yaw: number
}

const DEFAULT_HEIGHT_SCALE = 22 / 1737.4
const MOON_RADIUS = 0.74
/** Shadow-centre displacement in lunar radii when the Sun sits 90° off-axis. */
const SHADOW_REACH = 3

/** Earth's shadow is antisolar: project the Sun direction and flip it. */
function shadowOffset(sunAzimuth: number, sunElevation: number): [number, number] {
  const azimuth = degreesToRadians(sunAzimuth)
  const elevation = degreesToRadians(sunElevation)
  return [
    -Math.sin(azimuth) * Math.cos(elevation) * SHADOW_REACH,
    -Math.sin(elevation) * SHADOW_REACH,
  ]
}

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uAlbedoTexture;
uniform float uAtmosphericOpticalDepth;
uniform float uExposure;
uniform float uHaloIntensity;
uniform float uHaloWidth;
uniform float uHeightScale;
uniform float uLongitudeOffset;
uniform sampler2D uNormalHeightTexture;
uniform float uNormalStrength;
uniform float uPenumbraWidth;
uniform vec2 uPointer;
uniform float uRefractedLightIntensity;
uniform float uReliefShadowStrength;
uniform vec2 uShadowOffset;
uniform float uSourceReady;
uniform float uTilt;
uniform float uYaw;
uniform float uUmbraRadius;

${COMPOSITION_GLSL}
out vec4 fragColor;

const float MOON_RADIUS = ${MOON_RADIUS.toFixed(2)};
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const vec3 FULL_MOON_LIGHT_DIRECTION = vec3(-0.055, 0.105, 0.9929);

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
  return mix(lommelSeeliger, incidentCosine, 0.14);
}

float terrainVisibility(vec3 geometricNormal, vec3 lightDirection, float centerHeight, vec2 uv) {
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

  float softness = 0.008 + 0.75 * fwidth(raySlope);
  float visibility = smoothstep(maxTerrainSlope - 0.012, maxTerrainSlope + softness, raySlope);
  vec2 textureSizePixels = vec2(textureSize(uNormalHeightTexture, 0));
  vec2 footprint = max(abs(dFdx(uv)), abs(dFdy(uv))) * textureSizePixels;
  float footprintFade = 1.0 - smoothstep(3.0, 9.0, max(footprint.x, footprint.y));
  return mix(1.0, visibility, uReliefShadowStrength * footprintFade);
}

float circleIntersectionArea(float firstRadius, float secondRadius, float separation) {
  if (separation >= firstRadius + secondRadius) return 0.0;
  if (separation <= abs(secondRadius - firstRadius)) {
    float containedRadius = min(firstRadius, secondRadius);
    return PI * containedRadius * containedRadius;
  }

  float separationSquared = separation * separation;
  float firstSquared = firstRadius * firstRadius;
  float secondSquared = secondRadius * secondRadius;
  float firstCosine = clamp(
    (separationSquared + firstSquared - secondSquared) /
      max(2.0 * separation * firstRadius, 0.000001),
    -1.0,
    1.0
  );
  float secondCosine = clamp(
    (separationSquared + secondSquared - firstSquared) /
      max(2.0 * separation * secondRadius, 0.000001),
    -1.0,
    1.0
  );
  float radical = max(
    (-separation + firstRadius + secondRadius) *
      (separation + firstRadius - secondRadius) *
      (separation - firstRadius + secondRadius) *
      (separation + firstRadius + secondRadius),
    0.0
  );
  return firstSquared * acos(firstCosine) + secondSquared * acos(secondCosine) -
    0.5 * sqrt(radical);
}

float visibleSun(vec2 lunarPosition) {
  float sunRadius = max(uPenumbraWidth * 0.5, 0.0001);
  float earthRadius = uUmbraRadius + sunRadius;
  float separation = length(lunarPosition - uShadowOffset);
  float overlap = circleIntersectionArea(sunRadius, earthRadius, separation);
  return clamp(1.0 - overlap / (PI * sunRadius * sunRadius), 0.0, 1.0);
}

vec3 filmic(vec3 color) {
  color = max(color, 0.0);
  return clamp(
    (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14),
    0.0,
    1.0
  );
}

vec3 displayEncode(vec3 linearColor) {
  return pow(filmic(linearColor), vec3(1.0 / 2.2));
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

  vec2 limbPosition = position / max(radialDistance, 0.0001);
  float limbSunVisibility = visibleSun(limbPosition);
  float outsideDistance = max(radialDistance - MOON_RADIUS, 0.0);
  float haloFalloff = exp(
    -outsideDistance / max(uHaloWidth * MOON_RADIUS, 0.0001)
  );
  float limbGlow = smoothstep(0.0, 0.22, limbSunVisibility);
  // Start the halo inside the AA ring so a fading disc cannot open a hole
  // before the glow is visible.
  float inwardHalo = smoothstep(MOON_RADIUS - edgeWidth * 2.5, MOON_RADIUS + edgeWidth, radialDistance);
  float haloAlpha = inwardHalo * uHaloIntensity * 0.46 * limbGlow * haloFalloff;
  vec3 haloDisplay = displayEncode(
    vec3(0.18, 0.46, 1.2) * uExposure * (0.65 + limbSunVisibility * 0.35)
  );

  if (coverage <= 0.0) {
    fragColor = vec4(haloDisplay * haloAlpha, haloAlpha);
    return;
  }

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
  vec4 normalHeight = sampleEquirectangular(uNormalHeightTexture, mappedDirection);
  vec3 tangentNormal = normalHeight.rgb * 2.0 - 1.0;
  tangentNormal.xy *= uNormalStrength;
  tangentNormal = normalize(tangentNormal);
  vec3 shadingNormal = normalize(tangentFrame(geometricNormal) * tangentNormal);
  vec3 albedo = sampleEquirectangular(uAlbedoTexture, mappedDirection).rgb;
  vec3 broadAlbedo = textureLod(uAlbedoTexture, surfaceUv, 2.5).rgb;
  vec3 detailedAlbedo = clamp(albedo + (albedo - broadAlbedo) * 0.85, 0.0, 1.0);
  vec3 contrastAlbedo = pow(detailedAlbedo, vec3(1.28)) * 1.24;

  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float viewCosine = max(dot(shadingNormal, viewDirection), 0.0);
  float geometricIncident = dot(geometricNormal, FULL_MOON_LIGHT_DIRECTION);
  float terminatorWidth = max(fwidth(geometricIncident), 0.0008);
  float geometricSunlight = smoothstep(-terminatorWidth, terminatorWidth, geometricIncident);
  float incidentCosine = max(dot(shadingNormal, FULL_MOON_LIGHT_DIRECTION), 0.0);
  float photometry = lunarDiskLaw(incidentCosine, viewCosine);
  float reliefVisibility = terrainVisibility(
    geometricNormal,
    FULL_MOON_LIGHT_DIRECTION,
    normalHeight.a,
    surfaceUv
  );

  float sunVisibility = visibleSun(spherePosition);
  float shadowDepth = 1.0 - sunVisibility;
  float shadowDistance = length(spherePosition - uShadowOffset);
  float boundaryBand = exp(
    -abs(shadowDistance - uUmbraRadius) / max(uPenumbraWidth * 0.72, 0.05)
  );
  float refractionProfile = mix(0.42, 1.0, boundaryBand);

  vec3 directColor = vec3(0.72, 0.89, 1.18);
  float directLight = sunVisibility * geometricSunlight * photometry * reliefVisibility;
  float partialSunSupport = 4.0 * sunVisibility * (1.0 - sunVisibility);
  float lunarLimb = pow(1.0 - max(dot(geometricNormal, viewDirection), 0.0), 2.4);
  directLight *= 1.0 + partialSunSupport * lunarLimb * 2.1;

  vec3 extinction = vec3(0.48, 2.35, 5.2) * uAtmosphericOpticalDepth;
  vec3 atmosphericTransmission = exp(-extinction);
  vec3 refractedDirection = normalize(vec3(-0.26, 0.48, 0.84));
  float refractedNormalResponse = mix(
    0.72,
    1.0,
    max(dot(shadingNormal, refractedDirection), 0.0)
  );
  float broadDiffuse = mix(0.38, 1.0, pow(viewCosine, 0.36)) * refractedNormalResponse;
  vec3 refractedLight = atmosphericTransmission * uRefractedLightIntensity * shadowDepth *
    refractionProfile * broadDiffuse;

  vec3 linearColor = contrastAlbedo * (directColor * directLight + refractedLight) * uExposure;
  vec3 surfaceDisplay = displayEncode(linearColor);
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  surfaceDisplay = clamp(surfaceDisplay + dither, 0.0, 1.0);

  // Dark collapsed texels need the inward halo; already-bright limb does not,
  // or the additive glow blows the rim to white.
  float surfaceLuma = dot(surfaceDisplay, vec3(0.2126, 0.7152, 0.0722));
  float fillNeed = 1.0 - smoothstep(0.12, 0.55, surfaceLuma);
  float limbSafety = smoothstep(0.93, 1.0, unprojectedRadius);
  surfaceDisplay = max(surfaceDisplay, haloDisplay * fillNeed * limbSafety * limbGlow * 0.7);
  float limbHalo = haloAlpha * mix(0.22, 1.0, max(fillNeed, 1.0 - coverage));

  float alpha = clamp(coverage + limbHalo, 0.0, 1.0);
  vec3 premultiplied = surfaceDisplay * coverage + haloDisplay * limbHalo;
  fragColor = vec4(premultiplied, alpha);
}
`

const spec: OrbRendererSpec<LunarEclipseResources, LunarEclipseFrameSettings, LunarSurface> = {
  label: 'LunarEclipse',
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'LunarEclipse')
    return {
      albedoTexture: createTexture(gl, 'LunarEclipse albedo', {
        placeholder: [255, 255, 255, 255],
      }),
      heightScale: DEFAULT_HEIGHT_SCALE,
      longitudeOffset: 0,
      normalHeightTexture: createTexture(gl, 'LunarEclipse normal', {
        placeholder: [128, 128, 255, 128],
      }),
      program,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'LunarEclipse'),
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
  // Nothing reads the clock: the eclipse only changes with settings, size or pointer.
  isAnimated: () => false,
  render(gl, resources, frame) {
    const { composition, hasSource, pointerX, pointerY, settings } = frame
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
    gl.uniform1f(uniforms.uAtmosphericOpticalDepth, settings.atmosphericOpticalDepth)
    gl.uniform1f(uniforms.uExposure, settings.exposure)
    gl.uniform1f(uniforms.uHaloIntensity, settings.haloIntensity)
    gl.uniform1f(uniforms.uHaloWidth, settings.haloWidth)
    gl.uniform1f(uniforms.uHeightScale, resources.heightScale)
    gl.uniform1f(uniforms.uLongitudeOffset, resources.longitudeOffset)
    gl.uniform1f(uniforms.uNormalStrength, settings.normalStrength)
    gl.uniform1f(uniforms.uPenumbraWidth, settings.penumbraWidth)
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY)
    gl.uniform1f(uniforms.uRefractedLightIntensity, settings.refractedLightIntensity)
    gl.uniform1f(uniforms.uReliefShadowStrength, settings.reliefShadowStrength)
    const [shadowX, shadowY] = shadowOffset(settings.sunAzimuth, settings.sunElevation)
    gl.uniform2f(uniforms.uShadowOffset, shadowX, shadowY)
    gl.uniform1f(uniforms.uSourceReady, hasSource ? 1 : 0)
    gl.uniform1f(uniforms.uTilt, degreesToRadians(settings.tilt))
    gl.uniform1f(uniforms.uUmbraRadius, settings.umbraRadius)
    gl.uniform1f(uniforms.uYaw, degreesToRadians(settings.yaw))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
}

export function LunarEclipseEffect({
  atmosphericOpticalDepth = 1.8,
  className,
  composition,
  exposure = 1.11,
  haloIntensity = 2.1,
  haloWidth = 0.4,
  lean = false,
  normalStrength = 1.13,
  onError,
  paused,
  penumbraWidth = 1.15,
  refractedLightIntensity = 1.62,
  reliefShadowStrength = 0.42,
  source,
  style,
  sunAzimuth = -16,
  sunElevation = 37,
  tilt = 0,
  umbraRadius = 2.2,
  viewport,
  yaw = 0,
}: LunarEclipseEffectProps) {
  const settings: LunarEclipseFrameSettings = {
    atmosphericOpticalDepth,
    exposure,
    haloIntensity,
    haloWidth,
    lean,
    normalStrength,
    penumbraWidth,
    refractedLightIntensity,
    reliefShadowStrength,
    sunAzimuth,
    sunElevation,
    tilt,
    umbraRadius,
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
