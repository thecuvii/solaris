import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const lunarEclipse = requirePlanet('lunar-eclipse')

export const metadata = planetMetadata(lunarEclipse)

export default function LunarEclipsePage() {
  return null
}
