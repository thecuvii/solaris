'use client'

import { useMemo } from 'react'
import { createTitanianAtmosphereSource } from './titanian-atmosphere.source'
import { TitanianOrbEffect, type TitanianOrbEffectProps } from './titanian-orb.effect'

export type TitanProps = Omit<TitanianOrbEffectProps, 'source'>

export function Titan(props: TitanProps) {
  const source = useMemo(() => createTitanianAtmosphereSource(), [])
  return <TitanianOrbEffect {...props} source={source} />
}
