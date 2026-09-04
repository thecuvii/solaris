import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { UranusPreview } from '../../../modules/planets/uranus'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const uranus = requirePlanet('uranus')

export const metadata = planetMetadata(uranus)

export default function UranusPage() {
  return (
    <PlanetPreview>
      <UranusPreview />
    </PlanetPreview>
  )
}
