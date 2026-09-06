'use client'

import { useMemo } from 'react'
import { createPlutonianSurfaceSource } from './plutonian-surface.source'
import { PlutonianOrbEffect, type PlutonianOrbEffectProps } from './plutonian-orb.effect'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type PlutoTextures = {
  albedo: string
  normalHeight: string
}

export type PlutoProps = Omit<PlutonianOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    textures: PlutoTextures
  }

export function Pluto({ onError, onReady, onStatusChange, textures, ...props }: PlutoProps) {
  // Key the source on the URLs so an inline `textures` literal stays stable.
  const { albedo, normalHeight } = textures
  const source = useMemo(
    () => createPlutonianSurfaceSource(albedo, normalHeight),
    [albedo, normalHeight],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <PlutonianOrbEffect {...props} source={source} />
}
