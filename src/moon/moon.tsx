'use client'

import { useMemo } from 'react'
import { LunarOrbEffect, type LunarOrbEffectProps } from './lunar-orb.effect'
import { createLunarSurfaceSource } from './lunar-surface.source'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type MoonTextures = {
  albedo: string
  normalHeight: string
}

export type MoonProps = Omit<LunarOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    heightScale?: number
    longitudeOffsetDegrees?: number
    textures: MoonTextures
  }

export function Moon({
  heightScale = 22 / 1737.4,
  longitudeOffsetDegrees = 0,
  onError,
  onReady,
  onStatusChange,
  textures,
  ...props
}: MoonProps) {
  // Key the source on the URLs so an inline `textures` literal stays stable.
  const { albedo, normalHeight } = textures
  const source = useMemo(
    () => createLunarSurfaceSource(albedo, normalHeight, longitudeOffsetDegrees, heightScale),
    [albedo, heightScale, longitudeOffsetDegrees, normalHeight],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })

  return <LunarOrbEffect {...props} source={source} />
}
