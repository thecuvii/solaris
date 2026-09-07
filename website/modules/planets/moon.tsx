'use client'

import type { CSSProperties } from 'react'
import { Moon } from '@cuvii/solaris/moon'

import { CanvasFade } from '../planet-page/canvas-fade'
import { expandedComposition, skyViewport } from '../planet-page/preview-frame'
import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { buildTextLighting } from '../showcase/chrome-ink'
import { textures } from '../showcase/showcase-data'

export function moonChromeStyle(moon: {
  earthshineIntensity: number
  sunAzimuth: number
  sunElevation: number
}): CSSProperties {
  return buildTextLighting({
    haloEnergy: Math.min(
      0.12 +
        Math.min(Math.max(1 - moon.sunElevation / 70, 0), 1) * 0.18 +
        Math.min(Math.max(moon.earthshineIntensity / 40, 0), 1) * 0.4,
      1,
    ),
    offsetX:
      -Math.sin((moon.sunAzimuth * Math.PI) / 180) *
      Math.cos((moon.sunElevation * Math.PI) / 180) *
      2.2,
    offsetY: -Math.sin((moon.sunElevation * Math.PI) / 180) * 2.2,
    rimHue: 75,
  })
}

export function MoonPreview() {
  return (
    <>
      <Moon
        {...usePlanetPreviewProps('moon')}
        composition={expandedComposition}
        textures={textures.moon}
        viewport={skyViewport}
      />
      <CanvasFade />
    </>
  )
}
