'use client'

import type { CSSProperties, RefObject } from 'react'
import { useLayoutEffect } from 'react'
import { useAtomValue } from 'jotai'

import { noneTextLighting } from '../showcase/chrome-ink'
import type { PlanetId } from '../showcase/showcase-data'
import {
  displayedSkyLightingAtom,
  eclipseHaloAtom,
  moonLightingAtom,
} from '../showcase/showcase-settings'
import { lunarEclipseChromeStyle } from './lunar-eclipse'
import { moonChromeStyle } from './moon'
import { skyChromeStyle, skyNavRowInks, useSkyChromeProbes } from './sky-chrome'
import type { SkyNavRowInk } from './sky-chrome'

const NAV_ROW_KEYS: (keyof SkyNavRowInk)[] = [
  '--showcase-nav-ink',
  '--showcase-nav-ink-hover',
  '--showcase-nav-ink-strong',
]
const NO_ROW_INKS: SkyNavRowInk[] = []

function usePlanetChrome(planetId: PlanetId): {
  navRows: SkyNavRowInk[]
  style: CSSProperties
} {
  const eclipse = useAtomValue(eclipseHaloAtom)
  const moon = useAtomValue(moonLightingAtom)
  const sky = useAtomValue(displayedSkyLightingAtom)
  const skyProbes = useSkyChromeProbes(planetId === 'sky')
  if (planetId === 'lunar-eclipse') {
    return { navRows: NO_ROW_INKS, style: lunarEclipseChromeStyle(eclipse) }
  }
  if (planetId === 'moon') return { navRows: NO_ROW_INKS, style: moonChromeStyle(moon) }
  if (planetId === 'sky') {
    return { navRows: skyNavRowInks(sky, skyProbes), style: skyChromeStyle(sky, skyProbes) }
  }
  return { navRows: NO_ROW_INKS, style: noneTextLighting() }
}

export function usePlanetChromeStyle(planetId: PlanetId): CSSProperties {
  return usePlanetChrome(planetId).style
}

export function PlanetPageInk({
  planetId,
  targetRef,
}: {
  planetId: PlanetId
  targetRef: RefObject<HTMLDivElement | null>
}) {
  const { navRows, style } = usePlanetChrome(planetId)
  useLayoutEffect(() => {
    const node = targetRef.current
    if (!node) return
    for (const [key, value] of Object.entries(style)) {
      if (value == null || value === '') node.style.removeProperty(key)
      else node.style.setProperty(key, String(value))
    }
  }, [style, targetRef])

  // Sky overrides the nav ink row by row; every other planet inherits the
  // page-level variables, so clear any leftovers.
  useLayoutEffect(() => {
    const rows = document.querySelectorAll<HTMLElement>('[data-chrome-probe="nav-row"]')
    rows.forEach((row, index) => {
      const ink = navRows[index]
      for (const key of NAV_ROW_KEYS) {
        if (ink) row.style.setProperty(key, ink[key])
        else row.style.removeProperty(key)
      }
    })
  }, [navRows])
  return null
}
