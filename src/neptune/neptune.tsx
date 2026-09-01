'use client'

import { useMemo } from 'react'
import { createNeptunianAtmosphereSource } from './neptunian-atmosphere.source'
import { NeptunianOrbEffect, type NeptunianOrbEffectProps } from './neptunian-orb.effect'

export type NeptuneProps = Omit<NeptunianOrbEffectProps, 'source'>

export function Neptune(props: NeptuneProps) {
  const source = useMemo(() => createNeptunianAtmosphereSource(), [])
  return <NeptunianOrbEffect {...props} source={source} />
}
