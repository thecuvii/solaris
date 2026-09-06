'use client'

import { useMemo } from 'react'
import { MartianOrbEffect, type MartianOrbEffectProps } from './martian-orb.effect'
import { createMartianSurfaceSource } from './martian-surface.source'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type MarsTextures = {
  albedo: string
  normalHeight: string
}

export type MarsProps = Omit<MartianOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    textures: MarsTextures
  }

export function Mars({ onError, onReady, onStatusChange, textures, ...props }: MarsProps) {
  // Key the source on the URLs so an inline `textures` literal stays stable.
  const { albedo, normalHeight } = textures
  const source = useMemo(
    () => createMartianSurfaceSource(albedo, normalHeight),
    [albedo, normalHeight],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <MartianOrbEffect {...props} source={source} />
}
