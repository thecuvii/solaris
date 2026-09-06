'use client'

import type { CSSProperties } from 'react'
import { LunarEclipse } from '@thecuvii/solaris/moon'

import { CanvasFade } from '../planet-page/canvas-fade'
import { expandedComposition, skyViewport } from '../planet-page/preview-frame'
import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { buildTextLighting } from '../showcase/chrome-ink'
import { textures } from '../showcase/showcase-data'

export function lunarEclipseChromeStyle(eclipse: {
  haloIntensity: number
  haloWidth: number
  offsetX: number
  offsetY: number
}): CSSProperties {
  return buildTextLighting({
    haloEnergy: Math.min(
      Math.max((eclipse.haloIntensity / 3) * Math.sqrt(eclipse.haloWidth), 0),
      1,
    ),
    offsetX: eclipse.offsetX,
    offsetY: eclipse.offsetY,
    rimHue: 220,
  })
}

export function LunarEclipsePreview() {
  return (
    <>
      <LunarEclipse
        {...usePlanetPreviewProps('lunar-eclipse')}
        composition={expandedComposition}
        textures={textures['lunar-eclipse']}
        viewport={skyViewport}
      />
      <CanvasFade />
    </>
  )
}
