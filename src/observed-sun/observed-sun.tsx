'use client'

import { ObservedSunEffect, type ObservedSunEffectProps } from './observed-sun.effect'

export type ObservedSunProps = ObservedSunEffectProps

/** The Sun as seen from the ground: no textures, fully procedural. */
export function ObservedSun(props: ObservedSunProps) {
  return <ObservedSunEffect {...props} />
}
