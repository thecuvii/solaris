import { planetMetadata } from '../modules/planet-page/planet-metadata'
import { defaultPlanetId, planetPath } from '../modules/planet-route/planet-route'
import { requirePlanet } from '../modules/showcase/showcase-data'

const homeHref = `${planetPath(defaultPlanetId)}/`

export const metadata = planetMetadata(requirePlanet(defaultPlanetId))

export default function HomePage() {
  // Cloudflare handles the HTTP redirect via public/_redirects.
  // Keep an HTML fallback for next dev and other static hosts.
  return <meta httpEquiv="refresh" content={`0;url=${homeHref}`} />
}
