'use client'

import { useMemo } from 'react'
import { createJovianCloudSource } from './jovian-cloud.source'
import { JovianOrbEffect, type JovianOrbEffectProps } from './jovian-orb.effect'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type JupiterTextures = {
  albedo: string
}

export type JupiterProps = Omit<JovianOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    textures: JupiterTextures
  }

export function Jupiter({ onError, onReady, onStatusChange, textures, ...props }: JupiterProps) {
  const source = useMemo(() => createJovianCloudSource(textures.albedo), [textures])
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <JovianOrbEffect {...props} source={source} />
}
