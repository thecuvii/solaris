'use client'

import { useMemo } from 'react'
import { createSaturnAtmosphereSource } from './saturn-atmosphere.source'
import { SaturnOrbEffect, type SaturnOrbEffectProps } from './saturn-orb.effect'

export type SaturnTextures = {
  atmosphere: string
  rings: string
}

export type SaturnProps = Omit<SaturnOrbEffectProps, 'source'> & {
  textures: SaturnTextures
}

export function Saturn({ textures, ...props }: SaturnProps) {
  const source = useMemo(
    () => createSaturnAtmosphereSource(textures.atmosphere, textures.rings),
    [textures],
  )
  return <SaturnOrbEffect {...props} source={source} />
}
