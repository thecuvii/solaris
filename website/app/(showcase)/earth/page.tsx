import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { EarthPreview } from '../../../modules/planets/earth'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const earth = requirePlanet('earth')

export const metadata = planetMetadata(earth)

export default function EarthPage() {
  return (
    <PlanetPreview expanded>
      <EarthPreview />
    </PlanetPreview>
  )
}
