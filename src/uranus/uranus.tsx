'use client'

import { useMemo } from 'react'
import { createUranianAtmosphereSource } from './uranian-atmosphere.source'
import { UranianOrbEffect, type UranianOrbEffectProps } from './uranian-orb.effect'

export type UranusProps = Omit<UranianOrbEffectProps, 'source'>

export function Uranus(props: UranusProps) {
  const source = useMemo(() => createUranianAtmosphereSource(), [])
  return <UranianOrbEffect {...props} source={source} />
}
