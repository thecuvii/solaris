'use client'

import { useMemo } from 'react'
import { AtmosphericOrbEffect, type AtmosphericOrbEffectProps } from './atmospheric-orb.effect'
import { createEarthSurfaceSource } from './earth-surface.source'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type EarthTextures = {
  /** Equirectangular cloud coverage in the red channel. */
  cloud: string
  /** Equirectangular sRGB daytime albedo. */
  day: string
  /** Ocean mask in the red channel. */
  material: string
  /** Equirectangular sRGB night-side emission (city lights). */
  night: string
  /** Tangent-space normal map. */
  normal: string
  /** Surface roughness in the red channel. */
  roughness: string
}

export type EarthProps = Omit<AtmosphericOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    longitudeOffsetDegrees?: number
    textures: EarthTextures
  }

export function Earth({
  longitudeOffsetDegrees = 0,
  onError,
  onReady,
  onStatusChange,
  textures,
  ...props
}: EarthProps) {
  // Key the source on the texture URLs, not the `textures` object identity.
  // An inline `textures={{ ... }}` literal would otherwise rebuild the WebGL
  // context and re-upload every texture on each parent render.
  const { cloud, day, material, night, normal, roughness } = textures
  const source = useMemo(
    () =>
      createEarthSurfaceSource(
        day,
        night,
        normal,
        roughness,
        cloud,
        material,
        longitudeOffsetDegrees,
      ),
    [cloud, day, longitudeOffsetDegrees, material, night, normal, roughness],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })

  return <AtmosphericOrbEffect {...props} onError={onError} source={source} />
}
