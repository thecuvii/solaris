'use client'

import type { ComponentType } from 'react'

import { EarthPreview } from '../planets/earth'
import { JupiterPreview } from '../planets/jupiter'
import { LunarEclipsePreview } from '../planets/lunar-eclipse'
import { MarsPreview } from '../planets/mars'
import { MercuryPreview } from '../planets/mercury'
import { MoonPreview } from '../planets/moon'
import { NeptunePreview } from '../planets/neptune'
import { PlutoPreview } from '../planets/pluto'
import { SaturnPreview } from '../planets/saturn'
import { SkyPreview } from '../planets/sky'
import { SunPreview } from '../planets/sun'
import { TitanPreview } from '../planets/titan'
import { UranusPreview } from '../planets/uranus'
import { VenusPreview } from '../planets/venus'
import type { PlanetId } from '../showcase/showcase-data'
import { PlanetPreview } from './planet-preview'

const expandedPlanets = new Set<PlanetId>(['earth', 'lunar-eclipse', 'moon', 'sky'])

const planetPreviews = {
  earth: EarthPreview,
  jupiter: JupiterPreview,
  'lunar-eclipse': LunarEclipsePreview,
  mars: MarsPreview,
  mercury: MercuryPreview,
  moon: MoonPreview,
  neptune: NeptunePreview,
  pluto: PlutoPreview,
  saturn: SaturnPreview,
  sky: SkyPreview,
  sun: SunPreview,
  titan: TitanPreview,
  uranus: UranusPreview,
  venus: VenusPreview,
} satisfies Record<PlanetId, ComponentType>

export function PlanetStage({ planetId }: { planetId: PlanetId }) {
  const Preview = planetPreviews[planetId]
  return (
    <PlanetPreview expanded={expandedPlanets.has(planetId)}>
      <Preview />
    </PlanetPreview>
  )
}
