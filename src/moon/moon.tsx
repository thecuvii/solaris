'use client'

import { useMemo } from 'react'
import { LunarOrbEffect, type LunarOrbEffectProps } from './lunar-orb.effect'
import { createLunarSurfaceSource } from './lunar-surface.source'

export type MoonTextures = {
  albedo: string
  normalHeight: string
}

export type MoonProps = Omit<LunarOrbEffectProps, 'source'> & {
  heightScale?: number
  longitudeOffsetDegrees?: number
  textures: MoonTextures
}

export function Moon({
  heightScale = 22 / 1737.4,
  longitudeOffsetDegrees = 0,
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

  return <LunarOrbEffect {...props} source={source} />
}
