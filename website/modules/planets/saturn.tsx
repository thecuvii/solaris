'use client'

import { Saturn } from '@cuvii/solaris/saturn'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export function SaturnPreview() {
  return <Saturn {...usePlanetPreviewProps('saturn')} textures={textures.saturn} />
}
