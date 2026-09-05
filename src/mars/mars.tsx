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
  const source = useMemo(
    () => createMartianSurfaceSource(textures.albedo, textures.normalHeight),
    [textures],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <MartianOrbEffect {...props} source={source} />
}
