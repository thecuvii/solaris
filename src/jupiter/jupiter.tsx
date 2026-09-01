'use client'

import { useMemo } from 'react'
import { createJovianCloudSource } from './jovian-cloud.source'
import { JovianOrbEffect, type JovianOrbEffectProps } from './jovian-orb.effect'

export type JupiterTextures = {
  albedo: string
}

export type JupiterProps = Omit<JovianOrbEffectProps, 'source'> & {
  textures: JupiterTextures
}

export function Jupiter({ textures, ...props }: JupiterProps) {
  const source = useMemo(() => createJovianCloudSource(textures.albedo), [textures])
  return <JovianOrbEffect {...props} source={source} />
}
