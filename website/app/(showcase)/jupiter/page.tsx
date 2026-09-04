import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const jupiter = requirePlanet('jupiter')

export const metadata = planetMetadata(jupiter)

export default function JupiterPage() {
  return null
}
