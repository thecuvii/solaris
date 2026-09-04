import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { ObservedSunPreview } from '../../../modules/planets/observed-sun'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const observedSun = requirePlanet('observed-sun')

export const metadata = planetMetadata(observedSun)

export default function ObservedSunPage() {
  return (
    <PlanetPreview expanded>
      <ObservedSunPreview />
    </PlanetPreview>
  )
}
