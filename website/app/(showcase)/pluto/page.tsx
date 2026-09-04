import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const pluto = requirePlanet('pluto')

export const metadata = planetMetadata(pluto)

export default function PlutoPage() {
  return null
}
