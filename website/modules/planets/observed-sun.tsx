'use client'

import type { CSSProperties } from 'react'
import { ObservedSun } from '@thecuvii/solaris/observed-sun'

import { bleedViewport, expandedComposition } from '../planet-page/preview-frame'
import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { chromeInk, noneTextLighting, observedSunWash } from '../showcase/chrome-ink'

export function observedSunChromeStyle(observedSun: {
  duskFlush: number
  exposure: number
  field: number
  glare: number
  sunElevation: number
}): CSSProperties {
  return { ...noneTextLighting(), ...chromeInk(observedSunWash(observedSun)) }
}

export function ObservedSunPreview() {
  return (
    <ObservedSun
      {...usePlanetPreviewProps('observed-sun')}
      composition={expandedComposition}
      viewport={bleedViewport}
    />
  )
}
