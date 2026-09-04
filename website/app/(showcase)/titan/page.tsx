import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const titan = requirePlanet('titan')

export const metadata = planetMetadata(titan)

export default function TitanPage() {
  return null
}
