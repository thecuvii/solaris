export type UniformLocations<Name extends string> = Record<Name, WebGLUniformLocation | null>

/**
 * Resolve every uniform location once after linking. Looking them up per frame
 * is a synchronous driver round-trip, so renderers keep this map alongside the
 * program and rebuild it when the context is restored.
 */
export function getUniformLocations<const Name extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly Name[],
): UniformLocations<Name> {
  const locations = {} as UniformLocations<Name>
  for (const name of names) {
    locations[name] = gl.getUniformLocation(program, name)
  }
  return locations
}

export type UniformResolver = (program: WebGLProgram, name: string) => WebGLUniformLocation | null

/**
 * Lazy per-program cache for renderers that juggle several programs. Keyed by
 * the program object, so a context restore (fresh programs) starts clean and
 * lost programs are collected without explicit cleanup.
 */
export function createUniformResolver(gl: WebGL2RenderingContext): UniformResolver {
  const cache = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>()
  return (program, name) => {
    let locations = cache.get(program)
    if (!locations) {
      locations = new Map()
      cache.set(program, locations)
    }
    let location = locations.get(name)
    if (location === undefined) {
      location = gl.getUniformLocation(program, name)
      locations.set(name, location)
    }
    return location
  }
}
