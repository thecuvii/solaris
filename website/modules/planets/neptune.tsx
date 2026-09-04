'use client'

import { Neptune } from '@thecuvii/solaris/neptune'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'

export function NeptunePreview() {
  return <Neptune {...usePlanetPreviewProps('neptune')} />
}
