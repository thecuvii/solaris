'use client'

import { useAtomValue } from 'jotai'

import type { PlanetId } from '../showcase/showcase-data'
import { planetSettingsAtom } from '../showcase/showcase-settings'
import { previewSurfaceStyle } from './preview-frame'

export function usePlanetPreviewProps(id: PlanetId) {
  const settings = useAtomValue(planetSettingsAtom(id))
  return { ...settings, style: previewSurfaceStyle }
}
