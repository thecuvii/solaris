import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const sky = requirePlanet('sky')

export const metadata = planetMetadata(sky)

export default function SkyPage() {
  return null
}
