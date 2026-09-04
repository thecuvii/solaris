export const previewSurfaceStyle = {
  height: '100%',
  position: 'relative' as const,
  width: '100%',
}

export const expandedComposition = {
  bottom: 'calc((clamp(480px, 68vh, 720px) - clamp(360px, 52vh, 590px)) / 2)',
  height: 'clamp(360px, 52vh, 590px)',
  width: 'calc(100% - 2 * clamp(24px, 4vw, 64px))',
}

export const insetViewport = {
  bottom: 0,
  left: 'clamp(24px, 4vw, 64px)',
  right: 'clamp(24px, 4vw, 64px)',
  top: 0,
}

export const bleedViewport = {
  bottom: 0,
  left: 'calc(50% - 50vw - (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
  right: 'calc(50% - 50vw + (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
  top: 'calc(var(--showcase-preview-top) * -1)',
}

export const moonViewport = {
  ...bleedViewport,
  bottom: 'calc(var(--showcase-preview-top) + 100% - 100vh)',
}
