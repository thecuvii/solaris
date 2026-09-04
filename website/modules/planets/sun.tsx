'use client'

import { Sun } from '@thecuvii/solaris/sun'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export function SunPreview() {
  return <Sun {...usePlanetPreviewProps('sun')} textures={textures.sun} />
}
