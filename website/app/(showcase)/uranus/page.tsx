import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const uranus = requirePlanet('uranus')

export const metadata = planetMetadata(uranus)

export default function UranusPage() {
  return null
}
