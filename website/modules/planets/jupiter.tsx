'use client'

import { Jupiter } from '@cuvii/solaris/jupiter'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export function JupiterPreview() {
  return <Jupiter {...usePlanetPreviewProps('jupiter')} textures={textures.jupiter} />
}
