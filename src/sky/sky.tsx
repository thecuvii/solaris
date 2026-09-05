'use client'

import { SkyEffect, type SkyEffectProps } from './sky.effect'

export type SkyProps = SkyEffectProps

/** The Sun as seen from the ground: no textures, fully procedural. */
export function Sky(props: SkyProps) {
  return <SkyEffect {...props} />
}
