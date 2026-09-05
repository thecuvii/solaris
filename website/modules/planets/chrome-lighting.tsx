'use client'

import type { CSSProperties } from 'react'
import { useRef } from 'react'
import { useAtomValue } from 'jotai'

import { noneTextLighting } from '../showcase/chrome-ink'
import type { PlanetId } from '../showcase/showcase-data'
import {
  eclipseHaloAtom,
  moonLightingAtom,
  skyLightingAtom,
  sliderGestureAtom,
} from '../showcase/showcase-settings'
import { lunarEclipseChromeStyle } from './lunar-eclipse'
import { moonChromeStyle } from './moon'
import { skyChromeStyle, useSkyChromeProbes } from './sky-chrome'

export function usePlanetChromeStyle(planetId: PlanetId): CSSProperties {
  const eclipse = useAtomValue(eclipseHaloAtom)
  const moon = useAtomValue(moonLightingAtom)
  const sky = useAtomValue(skyLightingAtom)
  const dragging = useAtomValue(sliderGestureAtom)
  const heldSky = useRef(sky)
  if (!dragging) heldSky.current = sky
  const skyProbes = useSkyChromeProbes(planetId === 'sky')
  if (planetId === 'lunar-eclipse') return lunarEclipseChromeStyle(eclipse)
  if (planetId === 'moon') return moonChromeStyle(moon)
  if (planetId === 'sky') return skyChromeStyle(dragging ? heldSky.current : sky, skyProbes)
  return noneTextLighting()
}
