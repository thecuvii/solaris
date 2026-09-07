'use client'

import { Mars } from '@cuvii/solaris/mars'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export function MarsPreview() {
  return <Mars {...usePlanetPreviewProps('mars')} textures={textures.mars} />
}
