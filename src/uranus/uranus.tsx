'use client'

import { useMemo } from 'react'
import { createUranianAtmosphereSource } from './uranian-atmosphere.source'
import { UranianOrbEffect, type UranianOrbEffectProps } from './uranian-orb.effect'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type UranusProps = Omit<UranianOrbEffectProps, 'source'> & SourceLifecycleProps

export function Uranus({ onError, onReady, onStatusChange, ...props }: UranusProps) {
  const source = useMemo(() => createUranianAtmosphereSource(), [])
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <UranianOrbEffect {...props} onError={onError} source={source} />
}
