'use client'

import { useMemo } from 'react'
import { createSaturnAtmosphereSource } from './saturn-atmosphere.source'
import { SaturnOrbEffect, type SaturnOrbEffectProps } from './saturn-orb.effect'
import { useSourceLifecycle } from '../internal/use-source-lifecycle'
import type { SourceLifecycleProps } from '../source-lifecycle'

export type SaturnTextures = {
  /** Equirectangular sRGB cloud albedo; alpha carries band detail for shading normals. */
  atmosphere: string
  /** 1D radial ring strip from inner to outer edge: RGB colour, alpha encodes optical depth. */
  rings: string
}

export type SaturnProps = Omit<SaturnOrbEffectProps, 'source'> &
  SourceLifecycleProps & {
    textures: SaturnTextures
  }

export function Saturn({ onError, onReady, onStatusChange, textures, ...props }: SaturnProps) {
  // Key the source on the URLs so an inline `textures` literal stays stable.
  const { atmosphere, rings } = textures
  const source = useMemo(() => createSaturnAtmosphereSource(atmosphere, rings), [atmosphere, rings])
  useSourceLifecycle(source, { onError, onReady, onStatusChange })
  return <SaturnOrbEffect {...props} onError={onError} source={source} />
}
