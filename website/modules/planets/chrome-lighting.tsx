'use client'

import type { CSSProperties } from 'react'
import { useAtomValue } from 'jotai'

import { noneTextLighting } from '../showcase/chrome-ink'
import type { PlanetId } from '../showcase/showcase-data'
import {
  eclipseHaloAtom,
  moonLightingAtom,
  observedSunLightingAtom,
} from '../showcase/showcase-settings'
import { useThrottledAtomValue } from '../showcase/use-throttled-atom-value'
import { lunarEclipseChromeStyle } from './lunar-eclipse'
import { moonChromeStyle } from './moon'
import { observedSunChromeStyle } from './observed-sun'

export function usePlanetChromeStyle(planetId: PlanetId): CSSProperties {
  const eclipse = useAtomValue(eclipseHaloAtom)
  const moon = useAtomValue(moonLightingAtom)
  const observedSun = useThrottledAtomValue(observedSunLightingAtom, 80)
  if (planetId === 'lunar-eclipse') return lunarEclipseChromeStyle(eclipse)
  if (planetId === 'moon') return moonChromeStyle(moon)
  if (planetId === 'observed-sun') return observedSunChromeStyle(observedSun)
  return noneTextLighting()
}
