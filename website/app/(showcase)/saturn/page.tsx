import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const saturn = requirePlanet('saturn')

export const metadata = planetMetadata(saturn)

export default function SaturnPage() {
  return null
}
