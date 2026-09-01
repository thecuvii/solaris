'use client'

import { useMemo } from 'react'
import { createSolarAia304Source } from './solar-aia-304.source'
import { SolarOrbEffect, type SolarOrbEffectProps } from './solar-orb.effect'

export type SunTextures = {
  observation: string
}

export type SunProps = Omit<SolarOrbEffectProps, 'source'> & {
  textures: SunTextures
}

export function Sun({ textures, ...props }: SunProps) {
  const source = useMemo(() => createSolarAia304Source(textures.observation), [textures])
  return <SolarOrbEffect {...props} source={source} />
}
