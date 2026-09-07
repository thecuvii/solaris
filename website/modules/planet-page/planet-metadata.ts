import type { Metadata } from 'next'

import type { Planet } from '../showcase/showcase-data'

export const socialImage = {
  alt: 'Solaris — React shader effects for the solar system',
  height: 630,
  url: '/og.png',
  width: 1200,
}

export function planetMetadata(planet: Planet): Metadata {
  const title = `${planet.name} — Solaris`
  return {
    alternates: { canonical: `/${planet.id}/` },
    description: planet.summary,
    openGraph: {
      description: planet.summary,
      images: [socialImage],
      siteName: 'Solaris',
      title,
      type: 'website',
      url: `/${planet.id}/`,
    },
    title,
    twitter: {
      card: 'summary_large_image',
      description: planet.summary,
      images: [socialImage],
      title,
    },
  }
}
