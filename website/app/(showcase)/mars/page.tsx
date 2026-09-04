import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const mars = requirePlanet('mars')

export const metadata = planetMetadata(mars)

export default function MarsPage() {
  return null
}
