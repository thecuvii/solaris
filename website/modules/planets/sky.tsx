'use client'

import { Sky } from '@thecuvii/solaris/sky'

import { expandedComposition, skyViewport } from '../planet-page/preview-frame'
import { usePlanetPreviewProps } from '../planet-page/use-planet-preview-props'
import { SKY_FADE_HEIGHT, skyFadeGradient } from './sky-chrome'

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
      {/*
        The canvas ends on a hard edge against the page background. Fade it
        out over the last stretch with a static gradient overlay — cheaper than
        a mask on a canvas that repaints every frame. The gradient follows an
        eased curve (see skyFadeCover) so it has no visible seam at the top;
        the chrome-ink model reads the same curve.
      */}
      <div
        aria-hidden="true"
        data-chrome-probe="fade"
        style={{
          background: skyFadeGradient(),
          bottom: skyViewport.bottom,
          height: SKY_FADE_HEIGHT,
          left: skyViewport.left,
          pointerEvents: 'none',
          position: 'absolute',
          right: skyViewport.right,
        }}
      />
    </>
  )
}
