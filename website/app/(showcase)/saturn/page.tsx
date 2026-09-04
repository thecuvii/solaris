import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { SaturnPreview } from '../../../modules/planets/saturn'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const saturn = requirePlanet('saturn')

export const metadata = planetMetadata(saturn)

export default function SaturnPage() {
  return (
    <PlanetPreview>
      <SaturnPreview />
    </PlanetPreview>
  )
}
