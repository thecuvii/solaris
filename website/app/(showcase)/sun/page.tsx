import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { SunPreview } from '../../../modules/planets/sun'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const sun = requirePlanet('sun')

export const metadata = planetMetadata(sun)

export default function SunPage() {
  return (
    <PlanetPreview>
      <SunPreview />
    </PlanetPreview>
  )
}
