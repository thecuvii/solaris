'use client'

import { useMemo } from 'react'
import { MartianOrbEffect, type MartianOrbEffectProps } from './martian-orb.effect'
import { createMartianSurfaceSource } from './martian-surface.source'

export type MarsTextures = {
  albedo: string
  normalHeight: string
}

export type MarsProps = Omit<MartianOrbEffectProps, 'source'> & {
  textures: MarsTextures
}

export function Mars({ textures, ...props }: MarsProps) {
  const source = useMemo(
    () => createMartianSurfaceSource(textures.albedo, textures.normalHeight),
    [textures],
  )
  return <MartianOrbEffect {...props} source={source} />
}
