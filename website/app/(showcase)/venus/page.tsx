import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { VenusPreview } from '../../../modules/planets/venus'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const venus = requirePlanet('venus')

export const metadata = planetMetadata(venus)

export default function VenusPage() {
  return (
    <PlanetPreview>
      <VenusPreview />
    </PlanetPreview>
  )
}
