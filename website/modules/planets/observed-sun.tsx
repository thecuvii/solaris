'use client'

import { ObservedSun } from '@thecuvii/solaris/observed-sun'

import { bleedViewport, expandedComposition } from '../planet-page/preview-frame'
import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'

export function ObservedSunPreview() {
  return (
    <>
      <div
        aria-hidden="true"
        data-solaris-composition=""
        style={{
          left: '50%',
          pointerEvents: 'none',
          position: 'absolute',
          transform: 'translateX(-50%)',
          ...expandedComposition,
        }}
      />
      <ObservedSun
        {...usePlanetPreviewProps('observed-sun')}
        composition={expandedComposition}
        viewport={bleedViewport}
      />
    </>
  )
}
