import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const neptune = requirePlanet('neptune')

export const metadata = planetMetadata(neptune)

export default function NeptunePage() {
  return null
}
