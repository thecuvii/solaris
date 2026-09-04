'use client'

import { Titan } from '@thecuvii/solaris/titan'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'

export function TitanPreview() {
  return <Titan {...usePlanetPreviewProps('titan')} />
}
