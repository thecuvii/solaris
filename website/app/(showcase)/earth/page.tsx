import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const earth = requirePlanet('earth')

export const metadata = planetMetadata(earth)

export default function EarthPage() {
  return null
}
