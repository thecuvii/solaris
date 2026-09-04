'use client'

import { usePathname } from 'next/navigation'

import { planetIdFromPathname } from './planet-route'

export function usePlanetId() {
  return planetIdFromPathname(usePathname())
}
