'use client'

import { useMemo } from 'react'
import { createSolarAia304Source } from './solar-aia-304.source'
import { SolarOrbEffect, type SolarOrbEffectProps } from './solar-orb.effect'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type SunTextures = {
  observation: string
}

export type SunProps = Omit<SolarOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    textures: SunTextures
  }

export function Sun({ onError, onReady, onStatusChange, textures, ...props }: SunProps) {
  const source = useMemo(() => createSolarAia304Source(textures.observation), [textures])
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <SolarOrbEffect {...props} source={source} />
}
