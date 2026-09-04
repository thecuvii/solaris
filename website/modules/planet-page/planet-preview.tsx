import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'

export function PlanetPreview({
  children,
  expanded = false,
}: {
  children: ReactNode
  expanded?: boolean
}) {
  return <div {...stylex.props(styles.frame, expanded && styles.frameExpanded)}>{children}</div>
}

const styles = stylex.create({
  frame: {
    bottom: 'calc((clamp(480px, 68vh, 720px) - clamp(360px, 52vh, 590px)) / 2)',
    height: 'clamp(360px, 52vh, 590px)',
    left: 'clamp(24px, 4vw, 64px)',
    position: 'absolute',
    right: 'clamp(24px, 4vw, 64px)',
    transformOrigin: 'center',
  },
  frameExpanded: {
    bottom: 0,
    height: 'auto',
    left: 0,
    right: 0,
    top: 0,
  },
})
