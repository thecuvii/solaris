'use client'

import { useMemo } from 'react'
import { LunarEclipseEffect, type LunarEclipseEffectProps } from './lunar-eclipse.effect'
import { createLunarSurfaceSource } from './lunar-surface.source'
import type { MoonTextures } from './moon'

export type LunarEclipseProps = Omit<LunarEclipseEffectProps, 'source'> & {
  heightScale?: number
  longitudeOffsetDegrees?: number
  textures: MoonTextures
}

export function LunarEclipse({
  heightScale = 22 / 1737.4,
  longitudeOffsetDegrees = 0,
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

  return <LunarEclipseEffect {...props} source={source} />
}
