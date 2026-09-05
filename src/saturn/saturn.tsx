'use client'

import { useMemo } from 'react'
import { createSaturnAtmosphereSource } from './saturn-atmosphere.source'
import { SaturnOrbEffect, type SaturnOrbEffectProps } from './saturn-orb.effect'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type SaturnTextures = {
  atmosphere: string
  rings: string
}

export type SaturnProps = Omit<SaturnOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    textures: SaturnTextures
  }

export function Saturn({ onError, onReady, onStatusChange, textures, ...props }: SaturnProps) {
  const source = useMemo(
    () => createSaturnAtmosphereSource(textures.atmosphere, textures.rings),
    [textures],
  )
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <SaturnOrbEffect {...props} source={source} />
}
