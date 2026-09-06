'use client'

import { Sky } from '@thecuvii/solaris/sky'

import { CanvasFade } from '../planet-page/canvas-fade'
import { expandedComposition, skyViewport } from '../planet-page/preview-frame'
import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'

export function SkyPreview() {
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
      <Sky
        {...usePlanetPreviewProps('sky')}
        composition={expandedComposition}
        viewport={skyViewport}
      />
      <CanvasFade />
    </>
  )
}
