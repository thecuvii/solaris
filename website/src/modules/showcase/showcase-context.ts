import { createContext, useContext, type Context } from 'react'

import type { PlanetTransitionPlan } from './planet-transition'
import type { Planet, PlanetId } from './showcase-data'

export type ShowcaseContextValue = {
  completePlanetTransition: () => void
  expandedPreviewActive: boolean
  plan: PlanetTransitionPlan
  planet: Planet
  previewPlanet: PlanetId
  transitionDirection: -1 | 1
}

// Vite HMR re-executes this module; reuse the same Context so consumers
// do not remount against a new identity and throw outside the provider.
const hmr = globalThis as typeof globalThis & {
  __solarisShowcaseContext?: Context<ShowcaseContextValue | null>
}

export const ShowcaseContext =
  hmr.__solarisShowcaseContext ??
  (hmr.__solarisShowcaseContext = createContext<ShowcaseContextValue | null>(null))

export function useShowcase(): ShowcaseContextValue {
  const context = useContext(ShowcaseContext)
  if (!context) throw new Error('ShowcasePlanetPage must be rendered inside ShowcaseLayout')
  return context
}
