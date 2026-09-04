import type { Metadata } from 'next'

import { getPlanet, preloadPlanetTextures } from './showcase-data'
import type { Planet, PlanetId } from './showcase-data'

export function loadPlanetPage(planetId: PlanetId): { planet: Planet } | null {
  const planet = getPlanet(planetId)
  if (!planet) return null
  if (typeof window !== 'undefined') preloadPlanetTextures(planet.id)
  return { planet }
}

export function planetMetadata(planet: Planet): Metadata {
  const title = `${planet.name} — Solaris`
  return {
    alternates: { canonical: `/${planet.id}/` },
    description: planet.summary,
    openGraph: {
      description: planet.summary,
      title,
    },
    title,
  }
}
