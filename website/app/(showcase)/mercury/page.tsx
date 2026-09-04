import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const mercury = requirePlanet('mercury')

export const metadata = planetMetadata(mercury)

export default function MercuryPage() {
  return null
}
