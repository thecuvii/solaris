'use client'

import { useMemo } from 'react'
import { createVenusianCloudSource } from './venusian-cloud.source'
import { VenusianOrbEffect, type VenusianOrbEffectProps } from './venusian-orb.effect'

export type VenusTextures = {
  cloudStructure: string
}

export type VenusProps = Omit<VenusianOrbEffectProps, 'source'> & {
  textures: VenusTextures
}

export function Venus({ textures, ...props }: VenusProps) {
  const source = useMemo(() => createVenusianCloudSource(textures.cloudStructure), [textures])
  return <VenusianOrbEffect {...props} source={source} />
}
