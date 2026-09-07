'use client'

import { Uranus } from '@cuvii/solaris/uranus'

import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'

export function UranusPreview() {
  return <Uranus {...usePlanetPreviewProps('uranus')} />
}
