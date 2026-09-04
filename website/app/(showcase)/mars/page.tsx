import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { MarsPreview } from '../../../modules/planets/mars'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const mars = requirePlanet('mars')

export const metadata = planetMetadata(mars)

export default function MarsPage() {
  return (
    <PlanetPreview>
      <MarsPreview />
    </PlanetPreview>
  )
}
