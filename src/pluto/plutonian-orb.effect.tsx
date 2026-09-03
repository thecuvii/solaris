'use client'

// Requires: react

import { useRef, type CSSProperties } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

export type PlutonianOrbSource = {
  ready?: () => Promise<void>
  render: () => {
    /** sRGB RGB; alpha byte round(reliefConfidence * 254) + 1. */
    albedo: HTMLImageElement
    /** Linear RGBA8: octahedral tangent normal RG and normalized height BA. */
    normalHeight: HTMLImageElement
    heightRangeMeters: readonly [minimum: number, maximum: number]
  } | null
}

export type PlutonianOrbEffectProps = {
  className?: string
  exposure?: number
  hazeForwardScattering?: number
  hazeIntensity?: number
  hazeThickness?: number
  iceResponse?: number
  lean?: boolean
  phaseFill?: number
  reliefStrength?: number
  roughness?: number
  source: PlutonianOrbSource
  spin?: number
  style?: CSSProperties
  sunAzimuth?: number
  sunElevation?: number
  tholinStrength?: number
  tilt?: number
  yaw?: number
}

type PlutonianResources = {
  albedoTexture: WebGLTexture
  heightTexture: WebGLTexture
  normalTexture: WebGLTexture
  program: WebGLProgram
  vertexArray: WebGLVertexArrayObject
}

type PlutonianFrameSettings = {
  exposure: number
  hazeForwardScattering: number
  hazeIntensity: number
  hazeThickness: number
  iceResponse: number
  lean: boolean
  phaseFill: number
  reliefStrength: number
  roughness: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  tholinStrength: number
  tilt: number
  yaw: number
}

type AnisotropyExtension = {
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
  TEXTURE_MAX_ANISOTROPY_EXT: number
}

const PLUTO_DATUM_RADIUS_METERS = 1_188_300
const PLUTO_RADIUS = 0.82

const VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uAlbedoTexture;
uniform float uExposure;
uniform float uHazeForwardScattering;
uniform float uHazeIntensity;
uniform float uHazeThickness;
uniform float uHeightMinimumScale;
uniform float uHeightRangeScale;
uniform sampler2D uHeightTexture;
uniform float uIceResponse;
uniform sampler2D uNormalTexture;
uniform float uPhaseFill;
uniform vec2 uPointer;
uniform float uReliefStrength;
uniform vec2 uResolution;
uniform float uRoughness;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uYaw;
uniform float uTholinStrength;
uniform float uViewTilt;

out vec4 fragColor;

const float BODY_RADIUS = ${PLUTO_RADIUS.toFixed(2)};
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float HORIZON_ANGLES[8] = float[](
  0.0013962634,
  0.0031415927,
  0.0069813170,
  0.0148352986,
  0.0314159265,
  0.0593411946,
  0.0977384381,
  0.1396263402
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

float poseAngle() {
  return -uViewTilt + uPointer.y * 0.08;
}

float longitudeAngle() {
  return uYaw + uPointer.x * 0.13;
}

vec3 textureDirection(vec3 direction) {
  return rotateY(rotateX(direction, poseAngle()), longitudeAngle());
}

vec3 inverseTextureDirection(vec3 direction) {
  return rotateX(rotateY(direction, -longitudeAngle()), -poseAngle());
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

ivec2 wrappedTexel(ivec2 coordinate, ivec2 size) {
  int wrappedX = coordinate.x % size.x;
  if (wrappedX < 0) wrappedX += size.x;
  return ivec2(wrappedX, clamp(coordinate.y, 0, size.y - 1));
}

ivec2 directionTexel(vec3 direction, ivec2 size) {
  return wrappedTexel(ivec2(floor(sphereUv(direction) * vec2(size))), size);
}

float decodeReliefConfidence(float transportAlpha) {
  return clamp((transportAlpha * 255.0 - 1.0) / 254.0, 0.0, 1.0);
}

float sampleReliefConfidence(vec3 direction) {
  ivec2 size = textureSize(uAlbedoTexture, 0);
  return decodeReliefConfidence(texelFetch(uAlbedoTexture, directionTexel(direction, size), 0).a);
}

float decodeHeight(ivec2 coordinate) {
  ivec2 size = textureSize(uHeightTexture, 0);
  vec4 packed = texelFetch(uHeightTexture, wrappedTexel(coordinate, size), 0);
  float highByte = floor(packed.b * 255.0 + 0.5);
  float lowByte = floor(packed.a * 255.0 + 0.5);
  return (highByte * 256.0 + lowByte) / 65535.0;
}

float sampleHeight(vec3 direction) {
  ivec2 size = textureSize(uHeightTexture, 0);
  return decodeHeight(directionTexel(direction, size));
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

float terrainVisibility(vec3 geometricNormal, vec3 mappedDirection, vec3 lightDirection) {
  if (uReliefStrength <= 0.0) return 1.0;
  float centerConfidence = sampleReliefConfidence(mappedDirection);
  if (centerConfidence <= 0.0) return 1.0;

  float incidentCosine = dot(geometricNormal, lightDirection);
  vec3 tangentLight = lightDirection - geometricNormal * incidentCosine;
  float tangentLength = length(tangentLight);
  if (incidentCosine <= 0.0 || tangentLength < 0.0001) return 1.0;

  vec3 marchDirection = tangentLight / tangentLength;
  float raySlope = incidentCosine / tangentLength;
  float centerHeight = sampleHeight(mappedDirection);
  float centerRadius = 1.0 + (
    uHeightMinimumScale + centerHeight * uHeightRangeScale
  ) * uReliefStrength;
  float maximumTerrainSlope = -1000.0;

  for (int index = 0; index < 8; index++) {
    float angularDistance = HORIZON_ANGLES[index];
    vec3 sampleRadial = normalize(
      geometricNormal * cos(angularDistance) + marchDirection * sin(angularDistance)
    );
    vec3 mappedSample = textureDirection(sampleRadial);
    float sampleConfidence = sampleReliefConfidence(mappedSample);
    if (sampleConfidence <= 0.0) continue;
    float sampleHeightValue = sampleHeight(mappedSample);
    float sampleRadius = 1.0 + (
      uHeightMinimumScale + sampleHeightValue * uHeightRangeScale
    ) * uReliefStrength;
    float terrainSlope = (
      sampleRadius * cos(angularDistance) - centerRadius
    ) / max(sampleRadius * sin(angularDistance), 0.00001);
    float confidenceSlope = mix(raySlope - 0.08, terrainSlope, sampleConfidence);
    maximumTerrainSlope = max(maximumTerrainSlope, confidenceSlope);
  }

  float softness = 0.004 + 0.45 * fwidth(raySlope);
  float visibility = smoothstep(
    maximumTerrainSlope - 0.005,
    maximumTerrainSlope + softness,
    raySlope
  );
  float directionFootprint = max(
    length(dFdx(mappedDirection)),
    length(dFdy(mappedDirection))
  ) * float(textureSize(uHeightTexture, 0).x) / TAU;
  float poleStretch = 1.0 / max(length(mappedDirection.xz), 0.12);
  float footprintFade = 1.0 - smoothstep(3.0, 9.0, directionFootprint * poleStretch);
  float shadowWeight = centerConfidence * footprintFade * clamp(uReliefStrength, 0.0, 1.0);
  return mix(1.0, visibility, shadowWeight);
}

float henyeyGreenstein(float cosineTheta, float asymmetry) {
  float g = clamp(asymmetry, 0.0, 0.92);
  float denominator = max(1.0 + g * g - 2.0 * g * cosineTheta, 0.00001);
  return (1.0 - g * g) / (4.0 * PI * pow(denominator, 1.5));
}

float bodySunVisibility(vec3 samplePosition, vec3 lightDirection) {
  float projection = dot(samplePosition, lightDirection);
  float discriminant = projection * projection - (
    dot(samplePosition, samplePosition) - BODY_RADIUS * BODY_RADIUS
  );
  if (projection >= 0.0 || discriminant <= 0.0) return 1.0;
  float nearest = -projection - sqrt(discriminant);
  return smoothstep(-0.0015, 0.0015, -nearest);
}

void integrateHaze(
  vec2 position,
  bool surfaceHit,
  float surfaceZ,
  float shellRadius,
  out vec3 inScattering,
  out float viewTransmission
) {
  inScattering = vec3(0.0);
  viewTransmission = 1.0;
  if (uHazeIntensity <= 0.0 || uHazeThickness <= 0.0) return;

  float shellZ = sqrt(max(shellRadius * shellRadius - dot(position, position), 0.0));
  float endZ = surfaceHit ? surfaceZ : -shellZ;
  float pathLength = max(shellZ - endZ, 0.0);
  float stepLength = pathLength / 6.0;
  float scaleHeight = 0.042 * BODY_RADIUS;
  float support = uHazeThickness * BODY_RADIUS;
  float normalization = scaleHeight * max(1.0 - exp(-support / scaleHeight), 0.00001);
  float tauVertical = 0.08 * uHazeIntensity;
  float phaseMeanOne = 4.0 * PI * henyeyGreenstein(
    dot(-uSunDirection, vec3(0.0, 0.0, 1.0)),
    uHazeForwardScattering
  );

  for (int index = 0; index < 6; index++) {
    float sampleZ = shellZ - (float(index) + 0.5) * stepLength;
    vec3 samplePosition = vec3(position, sampleZ);
    float altitude = max(length(samplePosition) - BODY_RADIUS, 0.0);
    float density = exp(-altitude / scaleHeight) / normalization;
    float deltaTau = tauVertical * density * stepLength;
    float sunVisibility = bodySunVisibility(samplePosition, uSunDirection);
    float scatterWeight = viewTransmission * (1.0 - exp(-deltaTau)) * 0.92;
    inScattering += scatterWeight * vec3(0.24, 0.52, 1.0) * phaseMeanOne * sunVisibility;
    viewTransmission *= exp(-deltaTau);
  }
}

vec3 filmic(vec3 color) {
  color = max(color, 0.0);
  return clamp(
    (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14),
    0.0,
    1.0
  );
}

void main() {
  if (uSourceReady < 0.5) {
    fragColor = vec4(0.0);
    return;
  }

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 position = (vUv * 2.0 - 1.0) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0));
  float radialDistance = length(position);
  float hazeSupport = max(uHazeThickness, 0.0) * BODY_RADIUS;
  float shellRadius = BODY_RADIUS + hazeSupport;
  float edgeWidth = max(fwidth(radialDistance), 0.0005);
  float surfaceCoverage = 1.0 - smoothstep(
    BODY_RADIUS - edgeWidth,
    BODY_RADIUS + edgeWidth,
    radialDistance
  );
  float atmosphereCoverage = 0.0;
  if (uHazeIntensity > 0.0 && uHazeThickness > 0.0) {
    atmosphereCoverage = 1.0 - smoothstep(
      shellRadius - edgeWidth,
      shellRadius + edgeWidth,
      radialDistance
    );
  }
  if (surfaceCoverage <= 0.0 && atmosphereCoverage <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  bool surfaceHit = radialDistance < BODY_RADIUS;
  float surfaceZ = surfaceHit
    ? sqrt(max(BODY_RADIUS * BODY_RADIUS - dot(position, position), 0.0))
    : 0.0;
  vec3 surfaceLinear = vec3(0.0);

  if (surfaceHit || surfaceCoverage > 0.0) {
    vec3 geometricNormal = normalize(vec3(position / BODY_RADIUS, surfaceZ / BODY_RADIUS));
    vec3 mappedDirection = textureDirection(geometricNormal);
    vec4 albedoSample = sampleEquirectangular(uAlbedoTexture, mappedDirection);
    float reliefConfidence = decodeReliefConfidence(albedoSample.a);
    vec3 albedo = albedoSample.rgb;
    float sourceLuminance = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
    float sourceChroma = max(albedo.r, max(albedo.g, albedo.b)) - min(albedo.r, min(albedo.g, albedo.b));
    float redness = max(albedo.r - max(albedo.g, albedo.b) * 1.04, 0.0);
    float tholinMask = smoothstep(0.015, 0.16, redness) * (1.0 - smoothstep(0.18, 0.46, sourceLuminance));
    float tholinAmount = clamp(uTholinStrength, 0.0, 1.5) * tholinMask;
    albedo *= mix(vec3(1.0), vec3(0.82, 0.66, 0.57), clamp(tholinAmount * 0.42, 0.0, 0.62));
    float iceMask = smoothstep(0.24, 0.52, sourceLuminance) * (
      1.0 - 0.45 * smoothstep(0.08, 0.28, sourceChroma)
    );

    vec3 tangentNormal = vec3(0.0, 0.0, 1.0);
    if (reliefConfidence > 0.0 && uReliefStrength > 0.0) {
      tangentNormal = decodeOctahedralNormal(
        sampleEquirectangular(uNormalTexture, mappedDirection).rg
      );
      tangentNormal = normalize(vec3(
        tangentNormal.xy * uReliefStrength * reliefConfidence,
        max(tangentNormal.z, 0.02)
      ));
    }
    vec3 mappedShadingNormal = tangentFrame(mappedDirection) * tangentNormal;
    vec3 shadingNormal = normalize(inverseTextureDirection(mappedShadingNormal));
    vec3 viewDirection = vec3(0.0, 0.0, 1.0);
    float geometricIncident = dot(geometricNormal, uSunDirection);
    float terminatorWidth = max(fwidth(geometricIncident), 0.0008);
    float geometricSunlight = smoothstep(-terminatorWidth, terminatorWidth, geometricIncident);
    float incidentCosine = max(dot(shadingNormal, uSunDirection), 0.0);
    float viewCosine = max(dot(shadingNormal, viewDirection), 0.0);
    float lsNormalized = 2.0 * incidentCosine / max(incidentCosine + viewCosine, 0.00001);
    float singleScatterMix = mix(0.88, 0.62, iceMask);
    float diffuseDisk = mix(incidentCosine, lsNormalized, singleScatterMix);

    float iceWeight = 0.0;
    float fresnel = 0.0;
    float specular = 0.0;
    if (uIceResponse > 0.0 && incidentCosine > 0.0 && viewCosine > 0.0) {
      vec3 halfVectorSum = uSunDirection + viewDirection;
      if (length(halfVectorSum) >= 0.00001) {
        vec3 halfVector = normalize(halfVectorSum);
        float normalHalf = clamp(dot(shadingNormal, halfVector), 0.0, 1.0);
        float viewHalf = clamp(dot(viewDirection, halfVector), 0.0, 1.0);
        float alpha = max(clamp(uRoughness, 0.35, 1.0) * clamp(uRoughness, 0.35, 1.0), 0.04);
        float alphaSquared = alpha * alpha;
        float distributionTerm = normalHalf * normalHalf * (alphaSquared - 1.0) + 1.0;
        float distribution = alphaSquared / max(PI * distributionTerm * distributionTerm, 0.00001);
        float visibilityDenominator = incidentCosine * sqrt(
          alphaSquared + (1.0 - alphaSquared) * viewCosine * viewCosine
        ) + viewCosine * sqrt(
          alphaSquared + (1.0 - alphaSquared) * incidentCosine * incidentCosine
        );
        float visibility = 0.5 / max(visibilityDenominator, 0.00001);
        fresnel = 0.018 + (1.0 - 0.018) * pow(1.0 - viewHalf, 5.0);
        iceWeight = clamp(0.5 * iceMask * uIceResponse, 0.0, 1.0);
        specular = distribution * visibility * fresnel * incidentCosine * iceWeight;
      }
    }

    float reliefVisibility = terrainVisibility(geometricNormal, mappedDirection, uSunDirection);
    vec3 diffuse = albedo * diffuseDisk * (1.0 - iceWeight * fresnel);
    vec3 direct = (diffuse + vec3(specular)) * geometricSunlight * reliefVisibility;
    vec3 phaseFill = albedo * max(uPhaseFill, 0.0) * (0.35 + 0.65 * viewCosine);
    surfaceLinear = direct + phaseFill;
  }

  vec3 inScattering = vec3(0.0);
  float viewTransmission = 1.0;
  if (atmosphereCoverage > 0.0) {
    integrateHaze(
      position,
      surfaceHit,
      surfaceZ,
      shellRadius,
      inScattering,
      viewTransmission
    );
  }

  float atmosphereAlpha = atmosphereCoverage * (1.0 - viewTransmission);
  float alpha = surfaceCoverage + (1.0 - surfaceCoverage) * atmosphereAlpha;
  if (alpha <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }
  vec3 premultipliedLinear = surfaceLinear * surfaceCoverage * viewTransmission
    + atmosphereCoverage * inScattering;
  vec3 straightLinear = premultipliedLinear / max(alpha, 0.00001);
  vec3 displayColor = pow(
    filmic(straightLinear * max(uExposure, 0.0)),
    vec3(1.0 / 2.2)
  );
  fragColor = vec4(displayColor * alpha, alpha);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Plutonian shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Plutonian shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create Plutonian shader program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown Plutonian shader link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function createTexture(
  gl: WebGL2RenderingContext,
  pixel: readonly [number, number, number, number],
  minFilter: number,
  magFilter: number,
): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Unable to create Plutonian texture')
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
    new Uint8Array(pixel),
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  if (minFilter === gl.LINEAR_MIPMAP_LINEAR) gl.generateMipmap(gl.TEXTURE_2D)
  return texture
}

function createResources(gl: WebGL2RenderingContext): PlutonianResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Plutonian vertex array')
  const datumNormalized = Math.round(((0 - -4_101) / (6_491 - -4_101)) * 65_535)
  const highByte = datumNormalized >> 8
  const lowByte = datumNormalized & 255
  const resources = {
    albedoTexture: createTexture(gl, [150, 128, 118, 1], gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR),
    heightTexture: createTexture(gl, [128, 128, highByte, lowByte], gl.NEAREST, gl.NEAREST),
    normalTexture: createTexture(
      gl,
      [128, 128, highByte, lowByte],
      gl.LINEAR_MIPMAP_LINEAR,
      gl.LINEAR,
    ),
    program: createProgram(gl),
    vertexArray,
  }
  gl.bindVertexArray(vertexArray)
  return resources
}

function deleteResources(gl: WebGL2RenderingContext, resources: PlutonianResources): void {
  gl.deleteTexture(resources.albedoTexture)
  gl.deleteTexture(resources.heightTexture)
  gl.deleteTexture(resources.normalTexture)
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

function validateSurface(surface: NonNullable<ReturnType<PlutonianOrbSource['render']>>): void {
  const { albedo, normalHeight } = surface
  if (
    !(albedo instanceof HTMLImageElement) ||
    !(normalHeight instanceof HTMLImageElement) ||
    !albedo.complete ||
    !normalHeight.complete ||
    albedo.naturalWidth <= 0 ||
    albedo.naturalHeight <= 0 ||
    albedo.naturalWidth !== normalHeight.naturalWidth ||
    albedo.naturalHeight !== normalHeight.naturalHeight ||
    albedo.naturalWidth !== albedo.naturalHeight * 2
  ) {
    throw new Error('Plutonian albedo and normalHeight must be decoded matching 2:1 images')
  }
  const [minimum, maximum] = surface.heightRangeMeters
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    throw new Error('Plutonian heightRangeMeters must be finite and strictly increasing')
  }
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: HTMLImageElement,
  internalFormat: number,
  generateMipmaps: boolean,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, image)
  if (generateMipmaps) gl.generateMipmap(gl.TEXTURE_2D)
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic') as AnisotropyExtension | null
  if (generateMipmaps && anisotropy) {
    const maximum = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
    gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(maximum, 8))
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function wrapDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180
}

function createPlutonianRenderer(
  canvas: HTMLCanvasElement,
  source: PlutonianOrbSource,
): CanvasRenderer<PlutonianFrameSettings> | null {
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
  let heightMinimumScale = -4_101 / PLUTO_DATUM_RADIUS_METERS
  let heightRangeScale = (6_491 - -4_101) / PLUTO_DATUM_RADIUS_METERS
  let resourceGeneration = 0
  let resources = createResources(gl)
  let startTime = performance.now()
  let lastTime = startTime
  const pointer = { currentX: 0, currentY: 0, targetX: 0, targetY: 0, velocityX: 0, velocityY: 0 }

  function uploadSource(): void {
    if (disposed || contextLost) return
    const surface = source.render()
    if (!surface) {
      hasSource = false
      return
    }
    validateSurface(surface)
    const previousColorSpace = gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) as number
    const previousFlip = Boolean(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL))
    const previousPremultiply = Boolean(gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL))
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    try {
      uploadTexture(gl, resources.albedoTexture, surface.albedo, gl.SRGB8_ALPHA8, true)
      uploadTexture(gl, resources.normalTexture, surface.normalHeight, gl.RGBA8, true)
      uploadTexture(gl, resources.heightTexture, surface.normalHeight, gl.RGBA8, false)
    } finally {
      gl.bindTexture(gl.TEXTURE_2D, null)
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, previousColorSpace)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
    }
    hasSource = true
    heightMinimumScale = surface.heightRangeMeters[0] / PLUTO_DATUM_RADIUS_METERS
    heightRangeScale =
      (surface.heightRangeMeters[1] - surface.heightRangeMeters[0]) / PLUTO_DATUM_RADIUS_METERS
  }

  function refreshSource(): void {
    const generation = resourceGeneration
    const ready = source.ready?.()
    if (!ready) {
      uploadSource()
      return
    }
    void ready.then(
      () => {
        if (generation === resourceGeneration) uploadSource()
      },
      () => {
        if (generation === resourceGeneration) uploadSource()
      },
    )
  }

  function resize(): void {
    const bounds = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio, 2)
    const width = Math.max(Math.round(bounds.width * dpr), 1)
    const height = Math.max(Math.round(bounds.height * dpr), 1)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }

  function updatePointer(delta: number, enabled: boolean): void {
    if (!enabled) {
      pointer.targetX = 0
      pointer.targetY = 0
    }
    const stiffness = 42
    const damping = 11
    pointer.velocityX += (pointer.targetX - pointer.currentX) * stiffness * delta
    pointer.velocityY += (pointer.targetY - pointer.currentY) * stiffness * delta
    const decay = Math.exp(-damping * delta)
    pointer.velocityX *= decay
    pointer.velocityY *= decay
    pointer.currentX += pointer.velocityX * delta
    pointer.currentY += pointer.velocityY * delta
  }

  function render(timestamp: number, settings: PlutonianFrameSettings): void {
    if (disposed || contextLost) return
    resize()
    const elapsed = (timestamp - startTime) / 1000
    const delta = Math.min((timestamp - lastTime) / 1000, 0.05)
    lastTime = timestamp
    updatePointer(delta, settings.lean)
    const azimuth = (clamp(settings.sunAzimuth, -180, 180) * Math.PI) / 180
    const elevation = (clamp(settings.sunElevation, -30, 90) * Math.PI) / 180
    const elevationCosine = Math.cos(elevation)
    const sunDirection = [
      Math.sin(azimuth) * elevationCosine,
      Math.sin(elevation),
      Math.cos(azimuth) * elevationCosine,
    ] as const
    const rotation =
      ((wrapDegrees(settings.yaw) + elapsed * clamp(settings.spin, 0, 2.9)) * Math.PI) / 180

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, resources.albedoTexture)
    gl.uniform1i(gl.getUniformLocation(resources.program, 'uAlbedoTexture'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, resources.normalTexture)
    gl.uniform1i(gl.getUniformLocation(resources.program, 'uNormalTexture'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, resources.heightTexture)
    gl.uniform1i(gl.getUniformLocation(resources.program, 'uHeightTexture'), 2)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uExposure'),
      clamp(settings.exposure, 0, 2),
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uHazeForwardScattering'),
      clamp(settings.hazeForwardScattering, 0, 0.92),
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uHazeIntensity'),
      clamp(settings.hazeIntensity, 0, 1.5),
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uHazeThickness'),
      clamp(settings.hazeThickness, 0, 0.18),
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uHeightMinimumScale'),
      heightMinimumScale,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uHeightRangeScale'), heightRangeScale)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uIceResponse'),
      clamp(settings.iceResponse, 0, 2),
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uPhaseFill'),
      clamp(settings.phaseFill, 0, 0.25),
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uPointer'),
      pointer.currentX,
      pointer.currentY,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uReliefStrength'),
      clamp(settings.reliefStrength, 0, 2),
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uResolution'),
      canvas.width,
      canvas.height,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uRoughness'),
      clamp(settings.roughness, 0.35, 1),
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uSourceReady'), hasSource ? 1 : 0)
    gl.uniform3f(gl.getUniformLocation(resources.program, 'uSunDirection'), ...sunDirection)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uYaw'), rotation)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uTholinStrength'),
      clamp(settings.tholinStrength, 0, 1.5),
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uViewTilt'),
      (clamp(settings.tilt, -30, 30) * Math.PI) / 180,
    )
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  function handlePointerMove(event: PointerEvent): void {
    const bounds = canvas.getBoundingClientRect()
    pointer.targetX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    pointer.targetY = 1 - ((event.clientY - bounds.top) / bounds.height) * 2
  }

  function handlePointerLeave(): void {
    pointer.targetX = 0
    pointer.targetY = 0
  }

  function handleContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
  }

  function handleContextRestored(): void {
    if (disposed) return
    contextLost = false
    resourceGeneration += 1
    resources = createResources(gl)
    hasSource = false
    heightMinimumScale = -4_101 / PLUTO_DATUM_RADIUS_METERS
    heightRangeScale = (6_491 - -4_101) / PLUTO_DATUM_RADIUS_METERS
    refreshSource()
    startTime = performance.now()
    lastTime = startTime
    resize()
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerleave', handlePointerLeave)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  refreshSource()
  resize()

  return {
    render,
    dispose(): void {
      disposed = true
      resourceGeneration += 1
      resizeObserver.disconnect()
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost) deleteResources(gl, resources)
    },
  }
}

export function PlutonianOrbEffect({
  className,
  exposure = 1,
  hazeForwardScattering = 0.78,
  hazeIntensity = 0.28,
  hazeThickness = 0.08,
  iceResponse = 0.6,
  lean = true,
  phaseFill = 0.035,
  reliefStrength = 0.85,
  roughness = 0.78,
  source,
  spin = 0,
  style,
  sunAzimuth = -38,
  sunElevation = 16,
  tholinStrength = 1,
  tilt = 25,
  yaw = 0,
}: PlutonianOrbEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameSettings: PlutonianFrameSettings = {
    exposure,
    hazeForwardScattering,
    hazeIntensity,
    hazeThickness,
    iceResponse,
    lean,
    phaseFill,
    reliefStrength,
    roughness,
    spin,
    sunAzimuth,
    sunElevation,
    tholinStrength,
    tilt,
    yaw,
  }

  useCanvasRenderer(canvasRef, frameSettings, source, createPlutonianRenderer)

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', touchAction: 'none', width: '100%', ...style }}
    />
  )
}
