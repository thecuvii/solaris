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
import { skyChromeStyle, useSkyChromeProbes } from './sky-chrome'

export function usePlanetChromeStyle(planetId: PlanetId): CSSProperties {
  const eclipse = useAtomValue(eclipseHaloAtom)
  const moon = useAtomValue(moonLightingAtom)
  const sky = useAtomValue(displayedSkyLightingAtom)
  const skyProbes = useSkyChromeProbes(planetId === 'sky')
  if (planetId === 'lunar-eclipse') return lunarEclipseChromeStyle(eclipse)
  if (planetId === 'moon') return moonChromeStyle(moon)
  if (planetId === 'sky') return skyChromeStyle(sky, skyProbes)
  return noneTextLighting()
}

export function PlanetPageInk({
  planetId,
  targetRef,
}: {
  planetId: PlanetId
  targetRef: RefObject<HTMLDivElement | null>
}) {
  const lighting = usePlanetChromeStyle(planetId)
  useLayoutEffect(() => {
    const node = targetRef.current
    if (!node) return
    for (const [key, value] of Object.entries(lighting)) {
      if (value == null || value === '') node.style.removeProperty(key)
      else node.style.setProperty(key, String(value))
    }
  }, [lighting, targetRef])
  return null
}
