'use client'

import { useMemo } from 'react'
import { LunarEclipseEffect, type LunarEclipseEffectProps } from './lunar-eclipse.effect'
import { createLunarSurfaceSource } from './lunar-surface.source'
import type { MoonTextures } from './moon'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type LunarEclipseProps = Omit<LunarEclipseEffectProps, 'source'> &
  SourceLifecycleProps & {
    /** Height-channel range as a fraction of the lunar radius. @default 22 / 1737.4 */
    heightScale?: number
    /** Rotates the texture so a chosen longitude faces the viewer at `yaw = 0`. @default 0 */
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
  // Key the source on the URLs so an inline `textures` literal stays stable.
  const { albedo, normalHeight } = textures
  const source = useMemo(
    () => createLunarSurfaceSource(albedo, normalHeight, longitudeOffsetDegrees, heightScale),
    [albedo, heightScale, longitudeOffsetDegrees, normalHeight],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })

  return <LunarEclipseEffect {...props} onError={onError} source={source} />
}
