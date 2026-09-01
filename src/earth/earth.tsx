'use client'

import { useMemo } from 'react'
import { AtmosphericOrbEffect, type AtmosphericOrbEffectProps } from './atmospheric-orb.effect'
import { createEarthSurfaceSource } from './earth-surface.source'

export type EarthTextures = {
  cloud: string
  day: string
  material: string
  night: string
  normal: string
  roughness: string
}

export type EarthProps = Omit<AtmosphericOrbEffectProps, 'source'> & {
  longitudeOffsetDegrees?: number
  textures: EarthTextures
}

export function Earth({ longitudeOffsetDegrees = 0, textures, ...props }: EarthProps) {
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

  return <AtmosphericOrbEffect {...props} source={source} />
}
