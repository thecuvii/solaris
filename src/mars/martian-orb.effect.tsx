'use client'

// Requires: react

import { type CSSProperties } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

export type MartianOrbSource = {
  ready?: () => Promise<void>
  render: () => {
    albedo: TexImageSource
    heightRangeMeters: readonly [minimum: number, maximum: number]
    longitudeOffsetDegrees?: number
    normalHeight: TexImageSource
  } | null
}

export type MartianOrbEffectProps = {
  axialTilt?: number
  blueAureole?: number
  className?: string
  density?: number
  dustAerosol?: number
  dustDetail?: number
  exposure?: number
  lean?: boolean
  normalStrength?: number
  photometricMix?: number
  selfShadowStrength?: number
  source: MartianOrbSource
  spin?: number
  style?: CSSProperties
  sunAzimuth?: number
  sunElevation?: number
  yaw?: number
}

type MartianResources = {
  albedoTexture: WebGLTexture
  heightTexture: WebGLTexture
  normalTexture: WebGLTexture
  program: WebGLProgram
  vertexArray: WebGLVertexArrayObject
}

type MartianFrameSettings = {
  axialTilt: number
  blueAureole: number
  density: number
  dustAerosol: number
  dustDetail: number
  exposure: number
  lean: boolean
  normalStrength: number
  photometricMix: number
  selfShadowStrength: number
  spin: number
  sunAzimuth: number
  sunElevation: number
  yaw: number
}

type AnisotropyExtension = {
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
  TEXTURE_MAX_ANISOTROPY_EXT: number
}

const MARS_MEAN_RADIUS_METERS = 3_389_500
const MARS_RADIUS = 0.8

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
uniform vec2 uResolution;
uniform float uSelfShadowStrength;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uYaw;

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
    uSelfShadowStrength <= 0.0
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
  return mix(1.0, visibility, clamp(uSelfShadowStrength, 0.0, 1.0));
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

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 position = (vUv * 2.0 - 1.0) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0));
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

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Martian shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Martian shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create Martian shader program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown Martian shader link error'
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
  if (!texture) throw new Error('Unable to create Martian texture')
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

function createResources(gl: WebGL2RenderingContext): MartianResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Martian vertex array')
  const resources = {
    albedoTexture: createTexture(gl, [255, 255, 255, 255], gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR),
    heightTexture: createTexture(gl, [128, 128, 128, 128], gl.NEAREST, gl.NEAREST),
    normalTexture: createTexture(gl, [128, 128, 128, 128], gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR),
    program: createProgram(gl),
    vertexArray,
  }
  gl.bindVertexArray(vertexArray)
  return resources
}

function deleteResources(gl: WebGL2RenderingContext, resources: MartianResources): void {
  gl.deleteTexture(resources.albedoTexture)
  gl.deleteTexture(resources.heightTexture)
  gl.deleteTexture(resources.normalTexture)
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: TexImageSource,
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

function createMartianRenderer(
  canvas: HTMLCanvasElement,
  source: MartianOrbSource,
): CanvasRenderer<MartianFrameSettings> | null {
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
  let heightScale = (21171 - -8177) / MARS_MEAN_RADIUS_METERS
  let longitudeOffset = 0
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

    const previousFlip = Boolean(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL))
    const previousPremultiply = Boolean(gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL))
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    uploadTexture(gl, resources.albedoTexture, surface.albedo, gl.SRGB8_ALPHA8, true)
    uploadTexture(gl, resources.normalTexture, surface.normalHeight, gl.RGBA8, true)
    uploadTexture(gl, resources.heightTexture, surface.normalHeight, gl.RGBA8, false)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
    hasSource = true
    heightScale =
      (surface.heightRangeMeters[1] - surface.heightRangeMeters[0]) / MARS_MEAN_RADIUS_METERS
    longitudeOffset = ((surface.longitudeOffsetDegrees ?? 0) * Math.PI) / 180
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

  function render(timestamp: number, settings: MartianFrameSettings): void {
    if (disposed || contextLost) return
    resize()
    const elapsed = (timestamp - startTime) / 1000
    const delta = Math.min((timestamp - lastTime) / 1000, 0.05)
    lastTime = timestamp
    updatePointer(delta, settings.lean)
    const azimuth = (settings.sunAzimuth * Math.PI) / 180
    const elevation = (settings.sunElevation * Math.PI) / 180
    const elevationCosine = Math.cos(elevation)
    const sunDirection = [
      Math.sin(azimuth) * elevationCosine,
      Math.sin(elevation),
      Math.cos(azimuth) * elevationCosine,
    ] as const

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
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uDensity'), settings.density)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uAxialTilt'),
      (settings.axialTilt * Math.PI) / 180,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uBlueAureole'), settings.blueAureole)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uDustAerosol'), settings.dustAerosol)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uDustDetail'), settings.dustDetail)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uExposure'), settings.exposure)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uHeightScale'), heightScale)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uLongitudeOffset'), longitudeOffset)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uNormalStrength'),
      settings.normalStrength,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uPhotometricMix'),
      settings.photometricMix,
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uPointer'),
      pointer.currentX,
      pointer.currentY,
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uResolution'),
      canvas.width,
      canvas.height,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uSelfShadowStrength'),
      settings.selfShadowStrength,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uSourceReady'), hasSource ? 1 : 0)
    gl.uniform3f(gl.getUniformLocation(resources.program, 'uSunDirection'), ...sunDirection)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uYaw'),
      ((settings.yaw + elapsed * settings.spin) * Math.PI) / 180,
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
    contextLost = false
    resources = createResources(gl)
    hasSource = false
    heightScale = (21171 - -8177) / MARS_MEAN_RADIUS_METERS
    longitudeOffset = 0
    uploadSource()
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
  uploadSource()
  void source.ready?.().then(uploadSource, () => undefined)
  resize()

  return {
    render,
    dispose(): void {
      disposed = true
      resizeObserver.disconnect()
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost) deleteResources(gl, resources)
    },
  }
}

export function MartianOrbEffect({
  axialTilt = 8,
  blueAureole = 0.12,
  className,
  density = 0.22,
  dustAerosol = 0.36,
  dustDetail = 0.1,
  exposure = 1.06,
  lean = true,
  normalStrength = 1.6,
  photometricMix = 0.45,
  selfShadowStrength = 1,
  source,
  spin = 1.2,
  style,
  sunAzimuth = -48,
  sunElevation = 9,
  yaw = 0,
}: MartianOrbEffectProps) {
  const frameSettings: MartianFrameSettings = {
    axialTilt,
    blueAureole,
    density,
    dustAerosol,
    dustDetail,
    exposure,
    lean,
    normalStrength,
    photometricMix,
    selfShadowStrength,
    spin,
    sunAzimuth,
    sunElevation,
    yaw,
  }
  const canvasRef = useCanvasRenderer(frameSettings, source, createMartianRenderer)

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', touchAction: 'none', width: '100%', ...style }}
    />
  )
}
