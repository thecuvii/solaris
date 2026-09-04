import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { MercuryPreview } from '../../../modules/planets/mercury'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const mercury = requirePlanet('mercury')

export const metadata = planetMetadata(mercury)

export default function MercuryPage() {
  return (
    <PlanetPreview>
      <MercuryPreview />
    </PlanetPreview>
  )
}
