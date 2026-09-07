'use client'

import { Titan } from '@cuvii/solaris/titan'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'

export function TitanPreview() {
  return <Titan {...usePlanetPreviewProps('titan')} />
}
