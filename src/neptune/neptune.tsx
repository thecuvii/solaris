'use client'

import { useMemo } from 'react'
import { createNeptunianAtmosphereSource } from './neptunian-atmosphere.source'
import { NeptunianOrbEffect, type NeptunianOrbEffectProps } from './neptunian-orb.effect'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type NeptuneProps = Omit<NeptunianOrbEffectProps, 'source'> & SourceLifecycleProps

export function Neptune({ onError, onReady, onStatusChange, ...props }: NeptuneProps) {
  const source = useMemo(() => createNeptunianAtmosphereSource(), [])
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <NeptunianOrbEffect {...props} source={source} />
}
