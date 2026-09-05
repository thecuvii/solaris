'use client'

import { useMemo } from 'react'
import { MercurialOrbEffect, type MercurialOrbEffectProps } from './mercurial-orb.effect'
import { createMercurialSurfaceSource } from './mercurial-surface.source'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type MercuryTextures = {
  albedo: string
  normalHeight: string
}

export type MercuryProps = Omit<MercurialOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    textures: MercuryTextures
  }

export function Mercury({ onError, onReady, onStatusChange, textures, ...props }: MercuryProps) {
  const source = useMemo(
    () => createMercurialSurfaceSource(textures.albedo, textures.normalHeight),
    [textures],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })

  return <MercurialOrbEffect {...props} source={source} />
}
