import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { TitanPreview } from '../../../modules/planets/titan'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const titan = requirePlanet('titan')

export const metadata = planetMetadata(titan)

export default function TitanPage() {
  return (
    <PlanetPreview>
      <TitanPreview />
    </PlanetPreview>
  )
}
