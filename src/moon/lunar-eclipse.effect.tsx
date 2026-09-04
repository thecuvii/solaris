'use client'

// Requires: react

import { useMemo, useRef, type CSSProperties, type RefObject } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

type LunarEclipseFrameSettings = {
  atmosphericOpticalDepth: number
  exposure: number
  haloIntensity: number
  haloWidth: number
  lean: boolean
  normalStrength: number
  offsetX: number
  offsetY: number
  penumbraWidth: number
  refractedLightIntensity: number
  reliefShadowStrength: number
  yaw: number
  umbraRadius: number
}

export type LunarEclipseSource = {
  ready?: () => Promise<void>
  render: () => {
    albedo: TexImageSource
    heightScale?: number
    longitudeOffsetDegrees?: number
    normalHeight: TexImageSource
  } | null
}

export type LunarEclipseComposition = {
  bottom?: CSSProperties['bottom']
  height: CSSProperties['height']
  width: CSSProperties['width']
}

export type LunarEclipseEffectProps = {
  atmosphericOpticalDepth?: number
  className?: string
  composition?: LunarEclipseComposition
  exposure?: number
  haloIntensity?: number
  haloWidth?: number
  lean?: boolean
  normalStrength?: number
  offsetX?: number
  offsetY?: number
  penumbraWidth?: number
  refractedLightIntensity?: number
  reliefShadowStrength?: number
  source: LunarEclipseSource
  style?: CSSProperties
  yaw?: number
  umbraRadius?: number
  viewport?: Pick<CSSProperties, 'bottom' | 'left' | 'right' | 'top'>
}

type LunarEclipseResources = {
  albedoTexture: WebGLTexture
  normalHeightTexture: WebGLTexture
  program: WebGLProgram
  vertexArray: WebGLVertexArrayObject
}

type AnisotropyExtension = {
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
  TEXTURE_MAX_ANISOTROPY_EXT: number
}

const DEFAULT_HEIGHT_SCALE = 22 / 1737.4
const MOON_RADIUS = 0.74

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
uniform float uAtmosphericOpticalDepth;
uniform vec2 uCompositionCenter;
uniform float uCompositionScale;
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
uniform vec2 uResolution;
uniform vec2 uShadowOffset;
uniform float uSourceReady;
uniform float uYaw;
uniform float uUmbraRadius;

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
  vec3 tilted = rotateX(surfaceNormal, uPointer.y * 0.1);
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

  vec2 position = (vUv * uResolution - uCompositionCenter) * 2.0 / uCompositionScale;
  float radialDistance = length(position);
  float edgeWidth = max(fwidth(radialDistance), 0.0005);
  float coverage = 1.0 - smoothstep(MOON_RADIUS - edgeWidth, MOON_RADIUS + edgeWidth, radialDistance);

  vec2 edgePosition = position / max(radialDistance, 0.0001);
  float edgeSunVisibility = visibleSun(edgePosition);
  float eclipseBoundarySupport = 4.0 * edgeSunVisibility * (1.0 - edgeSunVisibility);
  float outsideDistance = max(radialDistance - MOON_RADIUS, 0.0);
  float haloFalloff = exp(
    -outsideDistance / max(uHaloWidth * MOON_RADIUS, 0.0001)
  );
  float haloAlpha = (1.0 - coverage) * uHaloIntensity * 0.46 *
    eclipseBoundarySupport * haloFalloff;
  vec3 haloDisplay = displayEncode(
    vec3(0.18, 0.46, 1.2) * uExposure * (0.65 + edgeSunVisibility * 0.35)
  );

  if (coverage <= 0.0) {
    fragColor = vec4(haloDisplay * haloAlpha, haloAlpha);
    return;
  }

  vec2 spherePosition = position / MOON_RADIUS;
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

  float alpha = clamp(coverage + haloAlpha, 0.0, 1.0);
  vec3 premultiplied = surfaceDisplay * coverage + haloDisplay * haloAlpha;
  fragColor = vec4(premultiplied, alpha);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create lunar eclipse shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown lunar eclipse shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create lunar eclipse shader program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown lunar eclipse shader link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function createTexture(
  gl: WebGL2RenderingContext,
  pixel: readonly [number, number, number, number],
): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Unable to create lunar eclipse texture')
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.generateMipmap(gl.TEXTURE_2D)
  return texture
}

function createResources(gl: WebGL2RenderingContext): LunarEclipseResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create lunar eclipse vertex array')
  const resources = {
    albedoTexture: createTexture(gl, [255, 255, 255, 255]),
    normalHeightTexture: createTexture(gl, [128, 128, 255, 128]),
    program: createProgram(gl),
    vertexArray,
  }
  gl.bindVertexArray(vertexArray)
  return resources
}

function deleteResources(gl: WebGL2RenderingContext, resources: LunarEclipseResources): void {
  gl.deleteTexture(resources.albedoTexture)
  gl.deleteTexture(resources.normalHeightTexture)
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: TexImageSource,
  internalFormat: number,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, image)
  gl.generateMipmap(gl.TEXTURE_2D)
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic') as AnisotropyExtension | null
  if (anisotropy) {
    const maximum = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
    gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(maximum, 8))
  }
}

function createLunarEclipseRenderer(
  canvas: HTMLCanvasElement,
  input: {
    compositionRef: RefObject<HTMLDivElement | null>
    hasComposition: boolean
    source: LunarEclipseSource
  },
): CanvasRenderer<LunarEclipseFrameSettings> | null {
  const { compositionRef, hasComposition, source } = input
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
  let heightScale = DEFAULT_HEIGHT_SCALE
  let longitudeOffset = 0
  let resourceGeneration = 0
  let resources = createResources(gl)
  let lastTime = performance.now()
  let compositionCenterX = 0
  let compositionCenterY = 0
  let compositionScale = 1
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
    try {
      uploadTexture(gl, resources.albedoTexture, surface.albedo, gl.SRGB8_ALPHA8)
      uploadTexture(gl, resources.normalHeightTexture, surface.normalHeight, gl.RGBA8)
    } finally {
      gl.bindTexture(gl.TEXTURE_2D, null)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
    }
    hasSource = true
    heightScale = surface.heightScale ?? DEFAULT_HEIGHT_SCALE
    longitudeOffset = ((surface.longitudeOffsetDegrees ?? 0) * Math.PI) / 180
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

    const compositionBounds = compositionRef.current?.getBoundingClientRect() ?? bounds
    const scaleX = width / Math.max(bounds.width, 1)
    const scaleY = height / Math.max(bounds.height, 1)
    compositionCenterX =
      (compositionBounds.left - bounds.left + compositionBounds.width / 2) * scaleX
    compositionCenterY =
      height - (compositionBounds.top - bounds.top + compositionBounds.height / 2) * scaleY
    compositionScale = Math.max(
      Math.min(compositionBounds.width * scaleX, compositionBounds.height * scaleY),
      1,
    )
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

  function render(timestamp: number, settings: LunarEclipseFrameSettings): void {
    if (contextLost) return
    resize()
    const delta = Math.min((timestamp - lastTime) / 1000, 0.05)
    lastTime = timestamp
    updatePointer(delta, settings.lean)

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
    gl.bindTexture(gl.TEXTURE_2D, resources.normalHeightTexture)
    gl.uniform1i(gl.getUniformLocation(resources.program, 'uNormalHeightTexture'), 1)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uAtmosphericOpticalDepth'),
      settings.atmosphericOpticalDepth,
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uCompositionCenter'),
      compositionCenterX,
      compositionCenterY,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uCompositionScale'), compositionScale)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uExposure'), settings.exposure)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uHaloIntensity'), settings.haloIntensity)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uHaloWidth'), settings.haloWidth)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uHeightScale'), heightScale)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uLongitudeOffset'), longitudeOffset)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uNormalStrength'),
      settings.normalStrength,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uPenumbraWidth'), settings.penumbraWidth)
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uPointer'),
      pointer.currentX,
      pointer.currentY,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uRefractedLightIntensity'),
      settings.refractedLightIntensity,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uReliefShadowStrength'),
      settings.reliefShadowStrength,
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uResolution'),
      canvas.width,
      canvas.height,
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uShadowOffset'),
      settings.offsetX,
      settings.offsetY,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uSourceReady'), hasSource ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uYaw'), (settings.yaw * Math.PI) / 180)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uUmbraRadius'), settings.umbraRadius)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  function handlePointerMove(event: PointerEvent): void {
    const bounds = compositionRef.current?.getBoundingClientRect() ?? canvas.getBoundingClientRect()
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
    heightScale = DEFAULT_HEIGHT_SCALE
    longitudeOffset = 0
    refreshSource()
    lastTime = performance.now()
    resize()
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  if (hasComposition && compositionRef.current) resizeObserver.observe(compositionRef.current)
  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerleave', handlePointerLeave)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  try {
    refreshSource()
    resize()
  } catch (error) {
    disposed = true
    resourceGeneration += 1
    resizeObserver.disconnect()
    canvas.removeEventListener('pointermove', handlePointerMove)
    canvas.removeEventListener('pointerleave', handlePointerLeave)
    canvas.removeEventListener('webglcontextlost', handleContextLost)
    canvas.removeEventListener('webglcontextrestored', handleContextRestored)
    if (!contextLost) deleteResources(gl, resources)
    throw error
  }

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

export function LunarEclipseEffect({
  atmosphericOpticalDepth = 1.18,
  className,
  composition,
  exposure = 1.18,
  haloIntensity = 1.15,
  haloWidth = 0.23,
  lean = true,
  normalStrength = 0.82,
  offsetX = 0.55,
  offsetY = -1.55,
  penumbraWidth = 0.72,
  refractedLightIntensity = 1.7,
  reliefShadowStrength = 0.36,
  source,
  style,
  yaw = 0,
  umbraRadius = 2.2,
  viewport,
}: LunarEclipseEffectProps) {
  const compositionRef = useRef<HTMLDivElement>(null)
  const hasComposition = composition !== undefined
  const frameSettings: LunarEclipseFrameSettings = {
    atmosphericOpticalDepth,
    exposure,
    haloIntensity,
    haloWidth,
    lean,
    normalStrength,
    offsetX,
    offsetY,
    penumbraWidth,
    refractedLightIntensity,
    reliefShadowStrength,
    yaw,
    umbraRadius,
  }

  const rendererInput = useMemo(
    () => ({ compositionRef, hasComposition, source }),
    [hasComposition, source],
  )

  const canvasRef = useCanvasRenderer(frameSettings, rendererInput, createLunarEclipseRenderer)

  if (composition) {
    return (
      <div
        className={className}
        style={{ height: '100%', position: 'relative', width: '100%', ...style }}
      >
        <div
          aria-hidden="true"
          ref={compositionRef}
          style={{
            left: '50%',
            pointerEvents: 'none',
            position: 'absolute',
            transform: 'translateX(-50%)',
            ...composition,
          }}
        />
        <div
          style={{
            bottom: 0,
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
            ...viewport,
          }}
        >
          <canvas
            aria-hidden="true"
            ref={canvasRef}
            style={{ display: 'block', height: '100%', touchAction: 'none', width: '100%' }}
          />
        </div>
      </div>
    )
  }

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', touchAction: 'none', width: '100%', ...style }}
    />
  )
}
