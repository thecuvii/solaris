import { ShowcaseApp } from '../modules/showcase/showcase-app'
import { getPlanet } from '../modules/showcase/showcase-data'
import { planetMetadata } from '../modules/showcase/planet-page'

const earth = getPlanet('earth')
if (!earth) throw new Error('Earth showcase data is missing')

export const metadata = planetMetadata(earth)

export default function HomePage() {
  return <ShowcaseApp planetId="earth" />
}
