'use client'

import { Pluto } from '@cuvii/solaris/pluto'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export function PlutoPreview() {
  return <Pluto {...usePlanetPreviewProps('pluto')} textures={textures.pluto} />
}
