'use client'

import { useMemo } from 'react'
import { MercurialOrbEffect, type MercurialOrbEffectProps } from './mercurial-orb.effect'
import { createMercurialSurfaceSource } from './mercurial-surface.source'

export type MercuryTextures = {
  albedo: string
  normalHeight: string
}

export type MercuryProps = Omit<MercurialOrbEffectProps, 'source'> & {
  textures: MercuryTextures
}

export function Mercury({ textures, ...props }: MercuryProps) {
  const source = useMemo(
    () => createMercurialSurfaceSource(textures.albedo, textures.normalHeight),
    [textures],
  )

  return <MercurialOrbEffect {...props} source={source} />
}
