'use client'

import { useMemo } from 'react'
import { createPlutonianSurfaceSource } from './plutonian-surface.source'
import { PlutonianOrbEffect, type PlutonianOrbEffectProps } from './plutonian-orb.effect'

export type PlutoTextures = {
  albedo: string
  normalHeight: string
}

export type PlutoProps = Omit<PlutonianOrbEffectProps, 'source'> & {
  textures: PlutoTextures
}

export function Pluto({ textures, ...props }: PlutoProps) {
  const source = useMemo(
    () => createPlutonianSurfaceSource(textures.albedo, textures.normalHeight),
    [textures],
  )
  return <PlutonianOrbEffect {...props} source={source} />
}
