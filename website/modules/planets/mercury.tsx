'use client'

import { Mercury } from '@thecuvii/solaris/mercury'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export function MercuryPreview() {
  return <Mercury {...usePlanetPreviewProps('mercury')} textures={textures.mercury} />
}
