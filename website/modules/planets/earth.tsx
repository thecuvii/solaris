'use client'

import { Earth } from '@thecuvii/solaris/earth'

import { CanvasFade } from '../planet-page/canvas-fade'
import { expandedComposition, skyViewport } from '../planet-page/preview-frame'
import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export function EarthPreview() {
  return (
    <>
      <Earth
        {...usePlanetPreviewProps('earth')}
        composition={expandedComposition}
        textures={textures.earth}
        viewport={skyViewport}
      />
      <CanvasFade />
    </>
  )
}
