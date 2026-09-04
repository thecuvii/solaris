'use client'

import { loadPlanetPage } from './planet-page'
import { ShowcaseLayout } from './showcase-layout'
import { ShowcasePlanetPage } from './showcase-planet-page'
import type { PlanetId } from './showcase-data'

export function ShowcaseApp({ planetId }: { planetId: PlanetId }) {
  loadPlanetPage(planetId)
  return (
    <ShowcaseLayout planetId={planetId}>
      <ShowcasePlanetPage />
    </ShowcaseLayout>
  )
}
