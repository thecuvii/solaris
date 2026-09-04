import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { PlutoPreview } from '../../../modules/planets/pluto'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const pluto = requirePlanet('pluto')

export const metadata = planetMetadata(pluto)

export default function PlutoPage() {
  return (
    <PlanetPreview>
      <PlutoPreview />
    </PlanetPreview>
  )
}
