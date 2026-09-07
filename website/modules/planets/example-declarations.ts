import type { PlanetId } from '../showcase/showcase-data'

/**
 * Extra top-level declarations and props to splice into a planet's example
 * snippet. Empty today: every planet renders with package defaults alone.
 */
export const planetExampleDeclarations: Partial<Record<PlanetId, string>> = {}

export const planetExampleProps: Partial<Record<PlanetId, string>> = {}
