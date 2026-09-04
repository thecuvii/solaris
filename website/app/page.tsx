import { planetMetadata } from '../modules/planet-page/planet-metadata'
import { defaultPlanetId, planetPath } from '../modules/planet-route/planet-route'
import { requirePlanet } from '../modules/showcase/showcase-data'

const earthHref = `${planetPath(defaultPlanetId)}/`

export const metadata = planetMetadata(requirePlanet(defaultPlanetId))

export default function HomePage() {
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${earthHref}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `location.replace(${JSON.stringify(earthHref)})`,
        }}
      />
    </>
  )
}
