'use client'

import { useMemo } from 'react'
import { LunarOrbEffect, type LunarOrbEffectProps } from './lunar-orb.effect'
import { createLunarSurfaceSource } from './lunar-surface.source'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type MoonTextures = {
  /** Equirectangular sRGB albedo. */
  albedo: string
  /** RGB: tangent-space normal. A: normalised LOLA height. */
  normalHeight: string
}

export type MoonProps = Omit<LunarOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    /** Height-channel range as a fraction of the lunar radius. @default 22 / 1737.4 */
    heightScale?: number
    /** Rotates the texture so a chosen longitude faces the viewer at `yaw = 0`. @default 0 */
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

  return <LunarOrbEffect {...props} onError={onError} source={source} />
}
