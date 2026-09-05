'use client'

import { useMemo } from 'react'
import { LunarEclipseEffect, type LunarEclipseEffectProps } from './lunar-eclipse.effect'
import { createLunarSurfaceSource } from './lunar-surface.source'
import type { MoonTextures } from './moon'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type LunarEclipseProps = Omit<LunarEclipseEffectProps, 'source'> &
  SourceLifecycleProps & {
    heightScale?: number
    longitudeOffsetDegrees?: number
    textures: MoonTextures
  }

export function LunarEclipse({
  heightScale = 22 / 1737.4,
  longitudeOffsetDegrees = 0,
  onError,
  onReady,
  onStatusChange,
  textures,
  ...props
}: LunarEclipseProps) {
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

  return <LunarEclipseEffect {...props} source={source} />
}
