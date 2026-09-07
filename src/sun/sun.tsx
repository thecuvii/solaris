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
  // Key the source on the URL so an inline `textures` literal stays stable.
  const { observation } = textures
  const source = useMemo(() => createSolarAia304Source(observation), [observation])
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <SolarOrbEffect {...props} onError={onError} source={source} />
}
