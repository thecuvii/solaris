import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { NeptunePreview } from '../../../modules/planets/neptune'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const neptune = requirePlanet('neptune')

export const metadata = planetMetadata(neptune)

export default function NeptunePage() {
  return (
    <PlanetPreview>
      <NeptunePreview />
    </PlanetPreview>
  )
}
