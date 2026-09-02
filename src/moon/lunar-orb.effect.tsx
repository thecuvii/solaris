'use client'

// Requires: react

import { useMemo, useRef, type CSSProperties, type RefObject } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

type LunarFrameSettings = {
  bloomIntensity: number
  bloomRadius: number
  bloomWarmth: number
  earthshineIntensity: number
  exposure: number
  normalStrength: number
  oppositionStrength: number
  oppositionWidth: number
  photometricMix: number
  reliefShadowStrength: number
  rotationSpeed: number
  sunAzimuth: number
  sunElevation: number
  surfaceRotation: number
  veilingGlare: number
}

export type LunarOrbSource = {
  ready?: () => Promise<void>
  render: () => {
    albedo: TexImageSource
    heightScale?: number
    longitudeOffsetDegrees?: number
    normalHeight: TexImageSource
  } | null
}

export type LunarOrbComposition = {
  bottom?: CSSProperties['bottom']
  height: CSSProperties['height']
  width: CSSProperties['width']
}

export type LunarOrbEffectProps = {
  bloomIntensity?: number
  bloomRadius?: number
  bloomWarmth?: number
  className?: string
  composition?: LunarOrbComposition
  earthshineIntensity?: number
  exposure?: number
  normalStrength?: number
  oppositionStrength?: number
  oppositionWidth?: number
  photometricMix?: number
  reliefShadowStrength?: number
  rotationSpeed?: number
  source: LunarOrbSource
  style?: CSSProperties
  sunAzimuth?: number
  sunElevation?: number
  surfaceRotation?: number
  veilingGlare?: number
  viewport?: Pick<CSSProperties, 'bottom' | 'left' | 'right' | 'top'>
}

type LunarResources = {
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
const MOON_RADIUS = 0.82

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
uniform float uBloomIntensity;
uniform float uBloomRadius;
uniform float uBloomWarmth;
uniform vec2 uCompositionCenter;
uniform float uCompositionScale;
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
uniform vec2 uResolution;
uniform float uSourceReady;
uniform vec3 uSunDirection;
uniform float uSurfaceRotation;
uniform float uVeilingGlare;

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
  vec3 tilted = rotateX(surfaceNormal, uPointer.y * 0.1);
  return rotateY(tilted, uLongitudeOffset + uSurfaceRotation + uPointer.x * 0.16);
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

  vec2 position = (vUv * uResolution - uCompositionCenter) * 2.0 / uCompositionScale;
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

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create lunar shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown lunar shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create lunar shader program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown lunar shader link error'
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
  if (!texture) throw new Error('Unable to create lunar texture')
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

function createResources(gl: WebGL2RenderingContext): LunarResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create lunar vertex array')
  const resources = {
    albedoTexture: createTexture(gl, [255, 255, 255, 255]),
    normalHeightTexture: createTexture(gl, [128, 128, 255, 128]),
    program: createProgram(gl),
    vertexArray,
  }
  gl.bindVertexArray(vertexArray)
  return resources
}

function deleteResources(gl: WebGL2RenderingContext, resources: LunarResources): void {
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

function createLunarRenderer(
  canvas: HTMLCanvasElement,
  input: {
    compositionRef: RefObject<HTMLDivElement | null>
    hasComposition: boolean
    source: LunarOrbSource
  },
): CanvasRenderer<LunarFrameSettings> | null {
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
  let sourceGeneration = 0
  let resources = createResources(gl)
  let startTime = performance.now()
  let lastTime = startTime
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
    uploadTexture(gl, resources.albedoTexture, surface.albedo, gl.SRGB8_ALPHA8)
    uploadTexture(gl, resources.normalHeightTexture, surface.normalHeight, gl.RGBA8)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
    hasSource = true
    heightScale = surface.heightScale ?? DEFAULT_HEIGHT_SCALE
    longitudeOffset = ((surface.longitudeOffsetDegrees ?? 0) * Math.PI) / 180
  }

  function refreshSource(): void {
    const generation = sourceGeneration
    uploadSource()
    void source.ready?.().then(
      () => {
        if (generation === sourceGeneration) uploadSource()
      },
      () => undefined,
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

  function updatePointer(delta: number): void {
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

  function render(timestamp: number, settings: LunarFrameSettings): void {
    if (contextLost) return
    resize()
    const elapsed = (timestamp - startTime) / 1000
    const delta = Math.min((timestamp - lastTime) / 1000, 0.05)
    lastTime = timestamp
    updatePointer(delta)
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
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uBloomIntensity'),
      settings.bloomIntensity,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uBloomRadius'), settings.bloomRadius)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uBloomWarmth'), settings.bloomWarmth)
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uCompositionCenter'),
      compositionCenterX,
      compositionCenterY,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uCompositionScale'), compositionScale)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, resources.normalHeightTexture)
    gl.uniform1i(gl.getUniformLocation(resources.program, 'uNormalHeightTexture'), 1)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uEarthshineIntensity'),
      settings.earthshineIntensity,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uExposure'), settings.exposure)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uHeightScale'), heightScale)
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uLongitudeOffset'), longitudeOffset)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uNormalStrength'),
      settings.normalStrength,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uOppositionStrength'),
      settings.oppositionStrength,
    )
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uOppositionWidth'),
      settings.oppositionWidth,
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
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uReliefShadowStrength'),
      settings.reliefShadowStrength,
    )
    gl.uniform2f(
      gl.getUniformLocation(resources.program, 'uResolution'),
      canvas.width,
      canvas.height,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uSourceReady'), hasSource ? 1 : 0)
    gl.uniform3f(gl.getUniformLocation(resources.program, 'uSunDirection'), ...sunDirection)
    gl.uniform1f(
      gl.getUniformLocation(resources.program, 'uSurfaceRotation'),
      (settings.surfaceRotation * Math.PI) / 180 + elapsed * settings.rotationSpeed,
    )
    gl.uniform1f(gl.getUniformLocation(resources.program, 'uVeilingGlare'), settings.veilingGlare)
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
    contextLost = false
    sourceGeneration += 1
    resources = createResources(gl)
    hasSource = false
    heightScale = DEFAULT_HEIGHT_SCALE
    longitudeOffset = 0
    uploadSource()
    startTime = performance.now()
    lastTime = startTime
    resize()
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  if (hasComposition && compositionRef.current) resizeObserver.observe(compositionRef.current)
  const pointerTarget: HTMLElement = compositionRef.current ?? canvas
  pointerTarget.addEventListener('pointermove', handlePointerMove)
  pointerTarget.addEventListener('pointerleave', handlePointerLeave)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  try {
    refreshSource()
    resize()
  } catch (error) {
    disposed = true
    sourceGeneration += 1
    resizeObserver.disconnect()
    pointerTarget.removeEventListener('pointermove', handlePointerMove)
    pointerTarget.removeEventListener('pointerleave', handlePointerLeave)
    canvas.removeEventListener('webglcontextlost', handleContextLost)
    canvas.removeEventListener('webglcontextrestored', handleContextRestored)
    if (!contextLost) deleteResources(gl, resources)
    throw error
  }

  return {
    render,
    dispose(): void {
      disposed = true
      sourceGeneration += 1
      resizeObserver.disconnect()
      pointerTarget.removeEventListener('pointermove', handlePointerMove)
      pointerTarget.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost) deleteResources(gl, resources)
    },
  }
}

export function LunarOrbEffect({
  bloomIntensity = 0,
  bloomRadius = 0.08,
  bloomWarmth = 0.35,
  className,
  composition,
  earthshineIntensity = 0.006,
  exposure = 0.72,
  normalStrength = 0.85,
  oppositionStrength = 0.25,
  oppositionWidth = 0.035,
  photometricMix = 0.14,
  reliefShadowStrength = 0.58,
  rotationSpeed = 0.012,
  source,
  style,
  sunAzimuth = -48,
  sunElevation = 16,
  surfaceRotation = 0,
  veilingGlare = 0,
  viewport,
}: LunarOrbEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const compositionRef = useRef<HTMLDivElement>(null)
  const hasComposition = composition !== undefined
  const frameSettings: LunarFrameSettings = {
    bloomIntensity,
    bloomRadius,
    bloomWarmth,
    earthshineIntensity,
    exposure,
    normalStrength,
    oppositionStrength,
    oppositionWidth,
    photometricMix,
    reliefShadowStrength,
    rotationSpeed,
    sunAzimuth,
    sunElevation,
    surfaceRotation,
    veilingGlare,
  }

  const rendererInput = useMemo(
    () => ({ compositionRef, hasComposition, source }),
    [hasComposition, source],
  )

  useCanvasRenderer(canvasRef, frameSettings, rendererInput, createLunarRenderer)

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
            pointerEvents: 'auto',
            position: 'absolute',
            touchAction: 'none',
            transform: 'translateX(-50%)',
            ...composition,
          }}
        />
        <div
          style={{
            bottom: 0,
            left: 0,
            pointerEvents: 'none',
            position: 'absolute',
            right: 0,
            top: 0,
            ...viewport,
          }}
        >
          <canvas
            aria-hidden="true"
            ref={canvasRef}
            style={{ display: 'block', height: '100%', pointerEvents: 'none', width: '100%' }}
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
