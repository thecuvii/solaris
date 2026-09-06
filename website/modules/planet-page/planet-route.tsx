import { planetMetadata } from './planet-metadata'
import { PlanetTexturePreloads } from './planet-texture-preloads'
import { requirePlanet } from '../showcase/showcase-data'
import type { PlanetId } from '../showcase/showcase-data'

export function planetRoute(id: PlanetId) {
  const planet = requirePlanet(id)
  return {
    default: function PlanetRoutePage() {
      return <PlanetTexturePreloads planetId={id} />
    },
    metadata: planetMetadata(planet),
  }
}
