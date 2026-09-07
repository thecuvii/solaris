/**
 * WebGL2 helpers shared by every planet renderer. Everything here is stateless
 * apart from per-context extension caches, so renderers can call these freely
 * during context restoration.
 */

export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  powerPreference: 'high-performance',
  premultipliedAlpha: true,
}

export function createWebGL2Context(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  return canvas.getContext('webgl2', CONTEXT_ATTRIBUTES)
}

/** Full-screen triangle; every planet draws with `gl.drawArrays(gl.TRIANGLES, 0, 3)`. */
export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

/**
 * GLSL snippet that maps a fragment to composition space: the composition box
 * spans [-1, 1] on its shorter side, centred on the planet. Declares the two
 * uniforms the renderer core fills in every frame.
 */
export const COMPOSITION_GLSL = `
uniform vec2 uCompositionCenter;
uniform float uCompositionScale;

vec2 compositionPosition() {
  return (gl_FragCoord.xy - uCompositionCenter) * 2.0 / uCompositionScale;
}
`

export const COMPOSITION_UNIFORM_NAMES = ['uCompositionCenter', 'uCompositionScale'] as const

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error(`Unable to create ${label} shader`)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown compile error'
    gl.deleteShader(shader)
    throw new Error(`${label} shader failed to compile: ${log}`)
  }
  return shader
}

export function createProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
  label: string,
  vertexSource: string = FULLSCREEN_VERTEX_SHADER,
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource, label)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, label)
  const program = gl.createProgram()
  if (!program) throw new Error(`Unable to create ${label} program`)
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown link error'
    gl.deleteProgram(program)
    throw new Error(`${label} program failed to link: ${log}`)
  }
  return program
}

export function createVertexArray(
  gl: WebGL2RenderingContext,
  label: string,
): WebGLVertexArrayObject {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error(`Unable to create ${label} vertex array`)
  return vertexArray
}

export type TextureOptions = {
  /** @default gl.RGBA8 */
  internalFormat?: number
  magFilter?: number
  minFilter?: number
  /**
   * 1×1 RGBA fill uploaded immediately so the sampler is complete before the
   * real data arrives. Defaults to opaque mid-grey.
   */
  placeholder?: readonly [number, number, number, number]
  wrapS?: number
  wrapT?: number
}

export function createTexture(
  gl: WebGL2RenderingContext,
  label: string,
  {
    internalFormat = gl.RGBA8,
    magFilter = gl.LINEAR,
    minFilter = gl.LINEAR_MIPMAP_LINEAR,
    placeholder = [128, 128, 128, 255],
    wrapS = gl.REPEAT,
    wrapT = gl.CLAMP_TO_EDGE,
  }: TextureOptions = {},
): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error(`Unable to create ${label} texture`)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(placeholder),
  )
  if (usesMipmaps(gl, minFilter)) gl.generateMipmap(gl.TEXTURE_2D)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return texture
}

function usesMipmaps(gl: WebGL2RenderingContext, minFilter: number): boolean {
  return (
    minFilter === gl.LINEAR_MIPMAP_LINEAR ||
    minFilter === gl.LINEAR_MIPMAP_NEAREST ||
    minFilter === gl.NEAREST_MIPMAP_LINEAR ||
    minFilter === gl.NEAREST_MIPMAP_NEAREST
  )
}

type AnisotropyExtension = {
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
  TEXTURE_MAX_ANISOTROPY_EXT: number
}

const anisotropyCache = new WeakMap<
  WebGL2RenderingContext,
  { extension: AnisotropyExtension; maximum: number } | null
>()

/** Resolved once per context; the extension query is a synchronous driver call. */
function getAnisotropy(gl: WebGL2RenderingContext) {
  let entry = anisotropyCache.get(gl)
  if (entry === undefined) {
    const extension = gl.getExtension(
      'EXT_texture_filter_anisotropic',
    ) as AnisotropyExtension | null
    entry = extension
      ? { extension, maximum: gl.getParameter(extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number }
      : null
    anisotropyCache.set(gl, entry)
  }
  return entry
}

export type UploadImageOptions = {
  /** Cap on anisotropic filtering. Only applied with mipmaps. @default 8 */
  anisotropy?: number
  /** @default gl.RGBA8 */
  internalFormat?: number
  /** @default true */
  mipmaps?: boolean
}

/**
 * Upload an image into a 2D texture. Caller is responsible for unpack state
 * (see {@link withUnpackState}).
 */
export function uploadImage(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: TexImageSource,
  { anisotropy = 8, internalFormat = gl.RGBA8, mipmaps = true }: UploadImageOptions = {},
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, image)
  if (mipmaps) {
    gl.generateMipmap(gl.TEXTURE_2D)
    const entry = getAnisotropy(gl)
    if (entry && anisotropy > 1) {
      gl.texParameterf(
        gl.TEXTURE_2D,
        entry.extension.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(entry.maximum, anisotropy),
      )
    }
  }
}

/**
 * Run `upload` with explicit pixel-store flags, then restore whatever the
 * consumer had set so sibling renderers on the same context are unaffected.
 */
export type UnpackState = {
  /** Row alignment in bytes; use 1 for single-channel or odd-width planes. */
  alignment?: 1 | 2 | 4 | 8
  /** Set false to keep packed data bytes exact (disables browser colour management). */
  colorSpaceConversion?: boolean
  flipY: boolean
  premultiplyAlpha: boolean
}

export function withUnpackState(
  gl: WebGL2RenderingContext,
  { alignment, colorSpaceConversion, flipY, premultiplyAlpha }: UnpackState,
  upload: () => void,
): void {
  const previousFlip = Boolean(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL))
  const previousPremultiply = Boolean(gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL))
  const previousAlignment = gl.getParameter(gl.UNPACK_ALIGNMENT) as number
  const previousConversion = gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) as number
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY ? 1 : 0)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha ? 1 : 0)
  if (alignment !== undefined) gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment)
  if (colorSpaceConversion !== undefined) {
    gl.pixelStorei(
      gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
      colorSpaceConversion ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE,
    )
  }
  try {
    upload()
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, previousAlignment)
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, previousConversion)
  }
}

export type RenderTarget = {
  framebuffer: WebGLFramebuffer
  height: number
  internalFormat: number
  texture: WebGLTexture
  type: number
  width: number
}

export function createRenderTarget(
  gl: WebGL2RenderingContext,
  label: string,
  width: number,
  height: number,
  internalFormat: number,
  type: number,
): RenderTarget {
  const texture = gl.createTexture()
  const framebuffer = gl.createFramebuffer()
  if (!texture || !framebuffer) throw new Error(`Unable to create ${label} render target`)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
    gl.deleteTexture(texture)
    gl.deleteFramebuffer(framebuffer)
    throw new Error(`${label} framebuffer is incomplete (status ${status})`)
  }
  return { framebuffer, height, internalFormat, texture, type, width }
}

export function resizeRenderTarget(
  gl: WebGL2RenderingContext,
  target: RenderTarget,
  width: number,
  height: number,
): void {
  if (target.width === width && target.height === height) return
  target.width = width
  target.height = height
  gl.bindTexture(gl.TEXTURE_2D, target.texture)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    target.internalFormat,
    width,
    height,
    0,
    gl.RGBA,
    target.type,
    null,
  )
}

export function deleteRenderTarget(gl: WebGL2RenderingContext, target: RenderTarget): void {
  gl.deleteFramebuffer(target.framebuffer)
  gl.deleteTexture(target.texture)
}

/** Unit vector for a sun at the given azimuth/elevation (degrees). */
export function sunDirection(
  azimuthDegrees: number,
  elevationDegrees: number,
): readonly [number, number, number] {
  const azimuth = (azimuthDegrees * Math.PI) / 180
  const elevation = (elevationDegrees * Math.PI) / 180
  const elevationCosine = Math.cos(elevation)
  return [
    Math.sin(azimuth) * elevationCosine,
    Math.sin(elevation),
    Math.cos(azimuth) * elevationCosine,
  ]
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
