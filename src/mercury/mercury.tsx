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
  // Key the source on the URLs so an inline `textures` literal stays stable.
  const { albedo, normalHeight } = textures
  const source = useMemo(
    () => createMercurialSurfaceSource(albedo, normalHeight),
    [albedo, normalHeight],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })

  return <MercurialOrbEffect {...props} source={source} />
}
