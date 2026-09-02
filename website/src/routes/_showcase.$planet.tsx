import { createFileRoute, notFound } from '@tanstack/react-router'

import { ShowcasePlanetPage } from '../showcase'
import {
  getPlanet,
  getPlanetTextureUrls,
  isPlanetId,
  preloadPlanetTextures,
} from '../showcase-data'

export const Route = createFileRoute('/_showcase/$planet')({
  beforeLoad: ({ params }) => {
    if (!isPlanetId(params.planet)) throw notFound()
  },
  loader: ({ params }) => {
    const planet = getPlanet(params.planet)
    if (!planet) throw notFound()
    if (typeof window !== 'undefined') preloadPlanetTextures(planet.id)
    return { planet }
  },
  head: ({ loaderData }) => ({
    links: getPlanetTextureUrls(loaderData?.planet.id).map((href) => ({
      as: 'image',
      crossOrigin: 'anonymous',
      href,
      rel: 'preload',
    })),
    meta: loaderData
      ? [
          { title: `${loaderData.planet.name} — Solaris` },
          { content: loaderData.planet.summary, name: 'description' },
        ]
      : [],
  }),
  component: ShowcasePlanetPage,
})
