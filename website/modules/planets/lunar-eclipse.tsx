'use client'

import type { CSSProperties } from 'react'
import { LunarEclipse } from '@cuvii/solaris/moon'

import { CanvasFade } from '../planet-page/canvas-fade'
import { expandedComposition, skyViewport } from '../planet-page/preview-frame'
import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { buildTextLighting } from '../showcase/chrome-ink'
import { textures } from '../showcase/showcase-data'

export function lunarEclipseChromeStyle(eclipse: {
  haloIntensity: number
  haloWidth: number
  sunAzimuth: number
  sunElevation: number
}): CSSProperties {
  return buildTextLighting({
    haloEnergy: Math.min(
      Math.max((eclipse.haloIntensity / 3) * Math.sqrt(eclipse.haloWidth), 0),
      1,
    ),
    // Same antisolar projection as the shader's shadow centre.
    offsetX:
      -Math.sin((eclipse.sunAzimuth * Math.PI) / 180) *
      Math.cos((eclipse.sunElevation * Math.PI) / 180) *
      3,
    offsetY: -Math.sin((eclipse.sunElevation * Math.PI) / 180) * 3,
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
