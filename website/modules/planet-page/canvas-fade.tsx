'use client'

import { SKY_FADE_HEIGHT, skyFadeGradient } from '../planets/sky-chrome'
import { skyViewport } from './preview-frame'

/**
 * Softens the hard canvas edge into the page (`#07080d`). Cheaper than a mask
 * on a canvas that repaints every frame. Shared by Sky and the other expanded
 * planets so atmosphere / bloom / halo can bleed off the disc.
 */
export function CanvasFade() {
  return (
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
  )
}
