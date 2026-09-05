'use client'

import { useMemo } from 'react'
import { createVenusianCloudSource } from './venusian-cloud.source'
import { VenusianOrbEffect, type VenusianOrbEffectProps } from './venusian-orb.effect'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type VenusTextures = {
  cloudStructure: string
}

export type VenusProps = Omit<VenusianOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    textures: VenusTextures
  }

export function Venus({ onError, onReady, onStatusChange, textures, ...props }: VenusProps) {
  const source = useMemo(() => createVenusianCloudSource(textures.cloudStructure), [textures])
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <VenusianOrbEffect {...props} source={source} />
}
