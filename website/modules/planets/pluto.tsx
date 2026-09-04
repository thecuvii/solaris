'use client'

import { Pluto } from '@thecuvii/solaris/pluto'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export function PlutoPreview() {
  return <Pluto {...usePlanetPreviewProps('pluto')} textures={textures.pluto} />
}
