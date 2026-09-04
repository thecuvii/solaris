import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const observedSun = requirePlanet('observed-sun')

export const metadata = planetMetadata(observedSun)

export default function ObservedSunPage() {
  return null
}
