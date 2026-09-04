import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { JupiterPreview } from '../../../modules/planets/jupiter'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const jupiter = requirePlanet('jupiter')

export const metadata = planetMetadata(jupiter)

export default function JupiterPage() {
  return (
    <PlanetPreview>
      <JupiterPreview />
    </PlanetPreview>
  )
}
