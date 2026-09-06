'use client'

import type { CSSProperties, RefObject } from 'react'
import { useLayoutEffect } from 'react'
import { useAtomValue } from 'jotai'

import { CHROME_INK_KEYS, noneTextLighting } from '../showcase/chrome-ink'
import type { ChromeInkProperties } from '../showcase/chrome-ink'
import type { PlanetId } from '../showcase/showcase-data'
import {
  displayedEclipseHaloAtom,
  displayedSkyLightingAtom,
  moonLightingAtom,
} from '../showcase/showcase-settings'
import { lunarEclipseChromeStyle } from './lunar-eclipse'
import { moonChromeStyle } from './moon'
import { SKY_INK_SELECTOR, skyChromeStyle, skyInkElements, useSkyChromeProbes } from './sky-chrome'

const NO_ELEMENT_INKS: (ChromeInkProperties | null)[] = []

function usePlanetChrome(planetId: PlanetId): {
  /** Per-element overrides for `[data-sky-ink]`, in DOM order. */
  elementInks: (ChromeInkProperties | null)[]
  style: CSSProperties
} {
  const eclipse = useAtomValue(displayedEclipseHaloAtom)
  const moon = useAtomValue(moonLightingAtom)
  const sky = useAtomValue(displayedSkyLightingAtom)
  const skyProbes = useSkyChromeProbes(planetId === 'sky')
  if (planetId === 'lunar-eclipse') {
    return { elementInks: NO_ELEMENT_INKS, style: lunarEclipseChromeStyle(eclipse) }
  }
  if (planetId === 'moon') return { elementInks: NO_ELEMENT_INKS, style: moonChromeStyle(moon) }
  if (planetId === 'sky') {
    return {
      elementInks: skyInkElements(sky, skyProbes),
      style: skyChromeStyle(sky, skyProbes),
    }
  }
  return { elementInks: NO_ELEMENT_INKS, style: noneTextLighting() }
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
  const { elementInks, style } = usePlanetChrome(planetId)
  useLayoutEffect(() => {
    const node = targetRef.current
    if (!node) return
    for (const [key, value] of Object.entries(style)) {
      if (value == null || value === '') node.style.removeProperty(key)
      else node.style.setProperty(key, String(value))
    }
  }, [style, targetRef])

  // Sky overrides ink element by element; every other planet inherits the
  // page-level variables, so clear any leftovers.
  useLayoutEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(SKY_INK_SELECTOR)
    elements.forEach((element, index) => {
      const ink = elementInks[index]
      for (const key of CHROME_INK_KEYS) {
        if (ink) element.style.setProperty(key, ink[key])
        else element.style.removeProperty(key)
      }
    })
  }, [elementInks])
  return null
}
