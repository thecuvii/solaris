import type { CSSProperties } from 'react'

/**
 * Layout box for the planet inside the canvas. The canvas may be larger than
 * the composition (see {@link OrbCanvasProps.viewport}) so glow and atmosphere
 * are not clipped at the edge. The box is horizontally centred; `bottom`
 * positions it vertically.
 */
export type OrbComposition = {
  bottom?: CSSProperties['bottom']
  height: CSSProperties['height']
  width: CSSProperties['width']
}

/**
 * Extra canvas bleed around the composition box, as CSS inset values. Negative
 * values grow the canvas past the component bounds.
 */
export type OrbViewport = Pick<CSSProperties, 'bottom' | 'left' | 'right' | 'top'>

/** Props shared by every canvas-backed component. */
export type OrbCanvasProps = {
  className?: string
  /** Planet layout box. Without it the planet fills the shorter canvas side. */
  composition?: OrbComposition
  /**
   * Follow the pointer with a subtle parallax lean. Ignored when the user
   * prefers reduced motion.
   * @default true
   */
  lean?: boolean
  /**
   * Called when the renderer fails: WebGL2 shader compilation, framebuffer
   * setup, or a source that hands back unusable data. The canvas stays blank
   * and no exception escapes into React.
   */
  onError?: (error: Error) => void
  /**
   * Stop the render loop. Rendering also pauses automatically while the canvas
   * is scrolled out of view.
   * @default false
   */
  paused?: boolean
  style?: CSSProperties
  /** Canvas bleed around the composition box. Only used with `composition`. */
  viewport?: OrbViewport
}

/** Orientation and rotation props shared by the spherical planets. */
export type OrbPoseProps = {
  /**
   * Continuous rotation about the polar axis in degrees per second. Frozen
   * when the user prefers reduced motion.
   */
  spin?: number
  /** Axial tilt towards the viewer in degrees. Positive tips the north pole forward. */
  tilt?: number
  /** Rotation about the polar axis in degrees. Adds to `spin` over time. */
  yaw?: number
}

/** Light direction props shared by the sunlit planets. */
export type OrbLightingProps = {
  /** Sun direction around the vertical axis in degrees. 0 lights from the front, ±90 from the sides. */
  sunAzimuth?: number
  /** Sun height above the equator plane in degrees. Negative lights from below. */
  sunElevation?: number
}
