'use client'

import { useMemo } from 'react'
import { AtmosphericOrbEffect, type AtmosphericOrbEffectProps } from './atmospheric-orb.effect'
import { createEarthSurfaceSource } from './earth-surface.source'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type EarthTextures = {
  cloud: string
  day: string
  material: string
  night: string
  normal: string
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
  const source = useMemo(
    () =>
      createEarthSurfaceSource(
        textures.day,
        textures.night,
        textures.normal,
        textures.roughness,
        textures.cloud,
        textures.material,
        longitudeOffsetDegrees,
      ),
    [longitudeOffsetDegrees, textures],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })

  return <AtmosphericOrbEffect {...props} source={source} />
}
