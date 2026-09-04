import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { LunarEclipsePreview } from '../../../modules/planets/lunar-eclipse'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const lunarEclipse = requirePlanet('lunar-eclipse')

export const metadata = planetMetadata(lunarEclipse)

export default function LunarEclipsePage() {
  return (
    <PlanetPreview expanded>
      <LunarEclipsePreview />
    </PlanetPreview>
  )
}
