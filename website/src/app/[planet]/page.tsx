import { notFound } from 'next/navigation'

import { ShowcaseApp } from '../../modules/showcase/showcase-app'
import { getPlanet, isPlanetId, planets } from '../../modules/showcase/showcase-data'
import { planetMetadata } from '../../modules/showcase/planet-page'

export const dynamicParams = false

export function generateStaticParams() {
  return planets.map((planet) => ({ planet: planet.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ planet: string }> }) {
  const { planet } = await params
  if (!isPlanetId(planet)) return {}
  const data = getPlanet(planet)
  return data ? planetMetadata(data) : {}
}

export default async function PlanetPage({ params }: { params: Promise<{ planet: string }> }) {
  const { planet } = await params
  if (!isPlanetId(planet)) notFound()
  return <ShowcaseApp planetId={planet} />
}
