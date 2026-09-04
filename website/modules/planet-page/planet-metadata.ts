import type { Metadata } from 'next'

import type { Planet } from '../showcase/showcase-data'

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
