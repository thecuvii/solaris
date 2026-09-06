'use client'

import { Earth } from '@thecuvii/solaris/earth'

import { CanvasFade } from '../planet-page/canvas-fade'
import { expandedComposition, skyViewport } from '../planet-page/preview-frame'
import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { textures } from '../showcase/showcase-data'

export const earthModel = {
  mieExtinction: [8, 8, 8],
  mieScattering: [5.4, 5.1, 4.8],
  ozoneAbsorption: [0.65, 1.88, 0.08],
  rayleighScattering: [3.2, 7.6, 18.5],
  space: [0, 0, 0.002],
  surfaceDay: [0.035, 0.22, 0.3],
  surfaceNight: [0.002, 0.006, 0.018],
  sun: [1, 0.91, 0.72],
  sunIntensity: 18,
} as const

export function EarthPreview() {
  return (
    <>
      <Earth
        {...usePlanetPreviewProps('earth')}
        composition={expandedComposition}
        model={earthModel}
        textures={textures.earth}
        viewport={skyViewport}
      />
      <CanvasFade />
    </>
  )
}
