import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const moon = requirePlanet('moon')

export const metadata = planetMetadata(moon)

export default function MoonPage() {
  return null
}
