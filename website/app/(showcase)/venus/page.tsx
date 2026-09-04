import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const venus = requirePlanet('venus')

export const metadata = planetMetadata(venus)

export default function VenusPage() {
  return null
}
