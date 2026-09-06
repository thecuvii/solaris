export const previewSurfaceStyle = {
  height: '100%',
  position: 'relative' as const,
  width: '100%',
}

export const expandedComposition = {
  bottom: 'var(--showcase-composition-bottom)',
  height: 'var(--showcase-composition-height)',
  top: 'var(--showcase-composition-top, auto)',
  width: 'calc(100% - 2 * clamp(24px, 4vw, 64px))',
}

export const insetViewport = {
  bottom: 0,
  left: 'var(--showcase-canvas-left, clamp(24px, 4vw, 64px))',
  right: 'var(--showcase-canvas-right, clamp(24px, 4vw, 64px))',
  top: 'var(--showcase-canvas-top, 0px)',
}

export const bleedViewport = {
  bottom: 0,
  left: 'calc(50% - 50vw - (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
  right: 'calc(50% - 50vw + (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
  top: 'calc(var(--showcase-preview-top) * -1 + var(--showcase-canvas-top, 0px))',
}

export const skyViewport = {
  ...bleedViewport,
  // Size off `lvh` (toolbar collapsed) plus a bleed so the canvas keeps painting
  // under Safari's translucent bottom bar and never resizes as the toolbar
  // animates. `100dvh` would end exactly at the bar's top edge. Shared by Sky
  // and the other expanded planets (Earth, Moon, Lunar Eclipse).
  bottom:
    'calc(var(--showcase-preview-top) + 100% - 100lvh - var(--showcase-sky-bleed, 0px) - var(--visual-viewport-bottom-inset, 0px))',
}
