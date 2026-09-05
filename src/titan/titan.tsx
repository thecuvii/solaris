'use client'

import { useMemo } from 'react'
import { createTitanianAtmosphereSource } from './titanian-atmosphere.source'
import { TitanianOrbEffect, type TitanianOrbEffectProps } from './titanian-orb.effect'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type TitanProps = Omit<TitanianOrbEffectProps, 'source'> & SourceLifecycleProps

export function Titan({ onError, onReady, onStatusChange, ...props }: TitanProps) {
  const source = useMemo(() => createTitanianAtmosphereSource(), [])
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <TitanianOrbEffect {...props} source={source} />
}
