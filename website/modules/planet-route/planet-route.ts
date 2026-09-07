import { isPlanetId } from '../showcase/showcase-data'
import type { PlanetId } from '../showcase/showcase-data'

export const defaultPlanetId = 'sky' satisfies PlanetId

export function planetPath(planetId: PlanetId): string {
  return `/${planetId}`
}

export function resolvePlanetId(value: unknown): PlanetId {
  return isPlanetId(value) ? value : defaultPlanetId
}

export function planetIdFromPathname(pathname: string): PlanetId {
  const segment = pathname.split('/').filter(Boolean)[0]
  return resolvePlanetId(segment)
}
