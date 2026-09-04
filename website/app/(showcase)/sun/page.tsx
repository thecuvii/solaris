import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const sun = requirePlanet('sun')

export const metadata = planetMetadata(sun)

export default function SunPage() {
  return null
}
