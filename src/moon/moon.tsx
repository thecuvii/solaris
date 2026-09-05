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
  const source = useMemo(
    () =>
      createLunarSurfaceSource(
        textures.albedo,
        textures.normalHeight,
        longitudeOffsetDegrees,
        heightScale,
      ),
    [heightScale, longitudeOffsetDegrees, textures],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })

  return <LunarOrbEffect {...props} source={source} />
}
