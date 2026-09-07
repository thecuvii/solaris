import type { RefObject } from 'react'

import type { CanvasRenderer } from './use-canvas-renderer'
import { createWebGL2Context } from './webgl'

/**
 * A planet's data feed. `ready` resolves once `render` can hand back a surface;
 * both are optional so fully procedural planets can pass `undefined`.
 */
export type OrbSource<Surface> = {
  ready?: () => Promise<void>
  render: () => Surface | null
}

/** Per-mount inputs that require a renderer rebuild when they change. */
export type OrbRendererInput<Surface> = {
  /** Composition box element. Read lazily; React attaches it before the canvas ref fires. */
  compositionRef: RefObject<HTMLElement | null>
  /** Whether a composition box is rendered; part of the input so toggling it rebuilds. */
  hasComposition: boolean
  source: OrbSource<Surface> | undefined
}

export type OrbSize = {
  /** Device pixel ratio actually applied (clamped). */
  dpr: number
  height: number
  width: number
}

/** Composition box in device pixels with a GL (bottom-left) origin. */
export type OrbCompositionFrame = {
  centerX: number
  centerY: number
  /** Shorter side of the composition box in device pixels. */
  scale: number
  /** Composition box height in device pixels. */
  height: number
  /** Composition box width in device pixels. */
  width: number
}

export type OrbFrame<Settings> = {
  composition: OrbCompositionFrame
  /** Seconds since the previous frame, clamped to 50 ms. */
  delta: number
  /** Seconds since mount. Frozen at 0 under `prefers-reduced-motion`. */
  elapsed: number
  hasSource: boolean
  height: number
  /** Smoothed pointer lean in [-1, 1]; zero when lean is off or reduced motion is on. */
  pointerX: number
  pointerY: number
  reducedMotion: boolean
  settings: Settings
  width: number
}

export type OrbSettingsBase = {
  lean: boolean
}

export type OrbRendererSpec<Resources, Settings extends OrbSettingsBase, Surface> = {
  /** Compile programs, allocate textures and targets. Called again after a context restore. */
  createResources: (gl: WebGL2RenderingContext) => Resources
  deleteResources: (gl: WebGL2RenderingContext, resources: Resources) => void
  /**
   * Return false when the current settings produce a static image; the core then
   * only redraws on size, settings, pointer or source changes. Reduced motion
   * forces static behaviour regardless.
   * @default () => true
   */
  isAnimated?: (settings: Settings) => boolean
  /**
   * Keep the pointer lean where the cursor left instead of springing back.
   * Earth uses this when the sun is not orbiting.
   */
  keepPointerOnLeave?: (settings: Settings) => boolean
  label: string
  /** @default 2 */
  maxDevicePixelRatio?: number
  /**
   * Render at least this many device pixels per CSS pixel. Saturn uses 2 so
   * thin tilted rings stay resolved on 1× displays.
   * @default 1
   */
  minDevicePixelRatio?: number
  render: (gl: WebGL2RenderingContext, resources: Resources, frame: OrbFrame<Settings>) => void
  /** Resize offscreen targets to the new canvas size. */
  resize?: (gl: WebGL2RenderingContext, resources: Resources, size: OrbSize) => void
  /**
   * Upload source data. Called when the source resolves and after a context
   * restore. Throw to report unusable data through `onError`.
   */
  upload?: (gl: WebGL2RenderingContext, resources: Resources, surface: Surface) => void
}

const POINTER_STIFFNESS = 42
const POINTER_DAMPING = 11
const MAX_FRAME_DELTA = 0.05

const reducedMotionQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

function shallowEqual(a: object, b: object): boolean {
  if (a === b) return true
  const keysA = Object.keys(a) as (keyof typeof a)[]
  if (keysA.length !== Object.keys(b).length) return false
  for (const key of keysA) {
    if (!Object.is(a[key], (b as typeof a)[key])) return false
  }
  return true
}

/**
 * Wire a planet spec to a canvas: context creation and loss, sizing, pointer
 * lean, the clock, source upload, and reduced-motion / static-frame skipping.
 * Returns null when WebGL2 is unavailable.
 */
export function createOrbRenderer<Resources, Settings extends OrbSettingsBase, Surface>(
  canvas: HTMLCanvasElement,
  input: OrbRendererInput<Surface>,
  spec: OrbRendererSpec<Resources, Settings, Surface>,
  getSettings: () => Settings,
  reportError: (error: Error) => void,
): CanvasRenderer<Settings> | null {
  const context = createWebGL2Context(canvas)
  if (!context) return null
  // Re-typed so closures below see a non-null context.
  const gl: WebGL2RenderingContext = context

  const { compositionRef, source } = input
  const maxDpr = spec.maxDevicePixelRatio ?? 2
  const minDpr = spec.minDevicePixelRatio ?? 1

  let resources: Resources | null = spec.createResources(gl)
  let contextLost = false
  let disposed = false
  let hasSource = false
  let failed = false
  let sizeDirty = true
  let needsFrame = true
  let startTime: number | null = null
  let lastTime = 0
  let lastSettings: Settings | null = null
  let reducedMotion = reducedMotionQuery?.matches ?? false
  let dprQuery: MediaQueryList | null = null

  const size: OrbSize = { dpr: 1, height: 1, width: 1 }
  const composition: OrbCompositionFrame = { centerX: 0, centerY: 0, height: 1, scale: 1, width: 1 }
  const pointer = { currentX: 0, currentY: 0, targetX: 0, targetY: 0, velocityX: 0, velocityY: 0 }

  function fail(error: unknown): void {
    if (failed) return
    failed = true
    reportError(error instanceof Error ? error : new Error(String(error)))
  }

  function uploadSource(): void {
    if (disposed || contextLost || failed || !resources || !source) return
    const surface = source.render()
    if (!surface) {
      hasSource = false
      return
    }
    try {
      spec.upload?.(gl, resources, surface)
      hasSource = true
      needsFrame = true
    } catch (error) {
      fail(error)
    }
  }

  function markDirty(): void {
    sizeDirty = true
  }

  function watchDevicePixelRatio(): void {
    // ResizeObserver does not fire when the window moves to a display with a
    // different density, so track the current ratio with a media query.
    dprQuery?.removeEventListener('change', watchDevicePixelRatio)
    dprQuery =
      typeof matchMedia === 'function'
        ? matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
        : null
    dprQuery?.addEventListener('change', watchDevicePixelRatio)
    markDirty()
  }

  function resize(): void {
    const bounds = canvas.getBoundingClientRect()
    const dpr = Math.max(Math.min(window.devicePixelRatio || 1, maxDpr), minDpr)
    const width = Math.max(Math.round(bounds.width * dpr), 1)
    const height = Math.max(Math.round(bounds.height * dpr), 1)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    size.dpr = dpr
    size.width = width
    size.height = height

    const compositionBounds = compositionRef.current?.getBoundingClientRect() ?? bounds
    const scaleX = width / Math.max(bounds.width, 1)
    const scaleY = height / Math.max(bounds.height, 1)
    composition.width = Math.max(compositionBounds.width * scaleX, 1)
    composition.height = Math.max(compositionBounds.height * scaleY, 1)
    composition.centerX =
      (compositionBounds.left - bounds.left + compositionBounds.width / 2) * scaleX
    composition.centerY =
      height - (compositionBounds.top - bounds.top + compositionBounds.height / 2) * scaleY
    composition.scale = Math.min(composition.width, composition.height)

    if (resources) spec.resize?.(gl, resources, size)
    sizeDirty = false
    needsFrame = true
  }

  function updatePointer(delta: number, enabled: boolean): boolean {
    if (!enabled) {
      pointer.targetX = 0
      pointer.targetY = 0
    }
    pointer.velocityX += (pointer.targetX - pointer.currentX) * POINTER_STIFFNESS * delta
    pointer.velocityY += (pointer.targetY - pointer.currentY) * POINTER_STIFFNESS * delta
    const decay = Math.exp(-POINTER_DAMPING * delta)
    pointer.velocityX *= decay
    pointer.velocityY *= decay
    pointer.currentX += pointer.velocityX * delta
    pointer.currentY += pointer.velocityY * delta
    const settled =
      Math.abs(pointer.velocityX) < 1e-4 &&
      Math.abs(pointer.velocityY) < 1e-4 &&
      Math.abs(pointer.targetX - pointer.currentX) < 1e-4 &&
      Math.abs(pointer.targetY - pointer.currentY) < 1e-4
    if (settled) {
      pointer.currentX = pointer.targetX
      pointer.currentY = pointer.targetY
      pointer.velocityX = 0
      pointer.velocityY = 0
    }
    return !settled
  }

  function render(timestamp: number, settings: Settings): void {
    if (disposed || contextLost || failed || !resources) return
    if (sizeDirty) resize()

    if (startTime === null) {
      startTime = timestamp
      lastTime = timestamp
    }
    const delta = Math.min((timestamp - lastTime) / 1000, MAX_FRAME_DELTA)
    lastTime = timestamp
    const elapsed = reducedMotion ? 0 : (timestamp - startTime) / 1000

    const leaning = settings.lean && !reducedMotion
    const pointerMoving = updatePointer(delta, leaning)

    const settingsChanged = !lastSettings || !shallowEqual(lastSettings, settings)
    lastSettings = settings
    const animated = !reducedMotion && (spec.isAnimated?.(settings) ?? true)
    if (!animated && !needsFrame && !settingsChanged && !pointerMoving) return
    needsFrame = false

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, size.width, size.height)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)

    try {
      spec.render(gl, resources, {
        composition,
        delta,
        elapsed,
        hasSource,
        height: size.height,
        pointerX: pointer.currentX,
        pointerY: pointer.currentY,
        reducedMotion,
        settings,
        width: size.width,
      })
    } catch (error) {
      fail(error)
      return
    }
    if (canvas.style.opacity !== '1') canvas.style.opacity = '1'
  }

  function handlePointerMove(event: PointerEvent): void {
    const bounds = pointerTarget.getBoundingClientRect()
    pointer.targetX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1
    pointer.targetY = 1 - ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2
  }

  function handlePointerLeave(): void {
    if (spec.keepPointerOnLeave?.(getSettings())) return
    pointer.targetX = 0
    pointer.targetY = 0
  }

  function handleContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
    resources = null
  }

  function handleContextRestored(): void {
    contextLost = false
    hasSource = false
    startTime = null
    try {
      resources = spec.createResources(gl)
    } catch (error) {
      fail(error)
      return
    }
    markDirty()
    uploadSource()
  }

  function handleReducedMotionChange(event: MediaQueryListEvent): void {
    reducedMotion = event.matches
    needsFrame = true
  }

  const resizeObserver = new ResizeObserver(markDirty)
  resizeObserver.observe(canvas)
  if (compositionRef.current) resizeObserver.observe(compositionRef.current)
  watchDevicePixelRatio()

  const pointerTarget: HTMLElement = compositionRef.current ?? canvas
  pointerTarget.addEventListener('pointermove', handlePointerMove)
  pointerTarget.addEventListener('pointerleave', handlePointerLeave)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  reducedMotionQuery?.addEventListener('change', handleReducedMotionChange)

  // Hidden until the first successful present so a slow shader compile does
  // not flash a blank or half-initialised frame.
  canvas.style.opacity = '0'

  uploadSource()
  void source?.ready?.().then(uploadSource, () => undefined)

  return {
    dispose(): void {
      disposed = true
      resizeObserver.disconnect()
      dprQuery?.removeEventListener('change', watchDevicePixelRatio)
      reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
      pointerTarget.removeEventListener('pointermove', handlePointerMove)
      pointerTarget.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (resources && !contextLost) spec.deleteResources(gl, resources)
      resources = null
    },
    render,
  }
}
