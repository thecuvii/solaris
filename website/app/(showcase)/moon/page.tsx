import { planetMetadata } from '../../../modules/planet-page/planet-metadata'
import { PlanetPreview } from '../../../modules/planet-page/planet-preview'
import { MoonPreview } from '../../../modules/planets/moon'
import { requirePlanet } from '../../../modules/showcase/showcase-data'

const moon = requirePlanet('moon')

export const metadata = planetMetadata(moon)

export default function MoonPage() {
  return (
    <PlanetPreview expanded>
      <MoonPreview />
    </PlanetPreview>
  )
}
