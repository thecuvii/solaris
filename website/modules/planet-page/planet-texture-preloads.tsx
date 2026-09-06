import { getPlanetTextureUrls } from '../showcase/showcase-data'
import type { PlanetId } from '../showcase/showcase-data'

/** Hoists into `<head>` so the current planet's maps start before JS. */
export function PlanetTexturePreloads({ planetId }: { planetId: PlanetId }) {
  return getPlanetTextureUrls(planetId).map((url) => (
    <link key={url} as="image" crossOrigin="anonymous" href={url} rel="preload" />
  ))
}
