'use client'

import { Venus } from '@thecuvii/solaris/venus'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export function VenusPreview() {
  return <Venus {...usePlanetPreviewProps('venus')} textures={textures.venus} />
}
