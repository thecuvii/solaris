import { useCallback, useEffect, useEffectEvent, useRef, type RefCallback } from 'react'

export type CanvasRenderer<Settings> = {
  dispose: () => void
  render: (timestamp: number, settings: Settings) => void
}

export type CreateCanvasRenderer<Settings, Input> = (
  canvas: HTMLCanvasElement,
  input: Input,
  getSettings: () => Settings,
  reportError: (error: Error) => void,
) => CanvasRenderer<Settings> | null

export type CanvasRendererOptions = {
  onError?: (error: Error) => void
  paused?: boolean
}

/**
 * Own a renderer for the lifetime of a canvas element. The render loop only
 * runs while the canvas is on screen and not paused; renderer failures are
 * routed to `onError` instead of escaping into React's commit phase.
 */
export function useCanvasRenderer<Settings, Input>(
  settings: Settings,
  input: Input,
  createRenderer: CreateCanvasRenderer<Settings, Input>,
  { onError, paused = false }: CanvasRendererOptions = {},
): RefCallback<HTMLCanvasElement> {
  const getSettings = useEffectEvent(() => settings)
  const isPaused = useEffectEvent(() => paused)
  const reportError = useEffectEvent((error: Error) => {
    onError?.(error)
  })
  const resumeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!paused) resumeRef.current?.()
  }, [paused])

  return useCallback<RefCallback<HTMLCanvasElement>>(
    (canvas) => {
      if (!canvas) return

      let renderer: CanvasRenderer<Settings> | null = null
      let failed = false
      let disposed = false
      let visible = true
      let frameId = 0

      function handleError(error: Error): void {
        if (failed) return
        failed = true
        stop()
        reportError(error)
      }

      try {
        renderer = createRenderer(canvas, input, getSettings, handleError)
      } catch (error) {
        handleError(error instanceof Error ? error : new Error(String(error)))
        return
      }
      if (!renderer) return
      const activeRenderer = renderer

      function stop(): void {
        if (frameId) cancelAnimationFrame(frameId)
        frameId = 0
      }

      function frame(timestamp: number): void {
        frameId = 0
        if (disposed || failed) return
        try {
          activeRenderer.render(timestamp, getSettings())
        } catch (error) {
          handleError(error instanceof Error ? error : new Error(String(error)))
          return
        }
        if (visible && !isPaused()) frameId = requestAnimationFrame(frame)
      }

      function resume(): void {
        if (disposed || failed || frameId || !visible || isPaused()) return
        frameId = requestAnimationFrame(frame)
      }

      // Do not burn GPU time on planets that are scrolled out of view.
      const intersection =
        typeof IntersectionObserver === 'function'
          ? new IntersectionObserver((entries) => {
              visible = entries.some((entry) => entry.isIntersecting)
              if (visible) resume()
              else stop()
            })
          : null
      intersection?.observe(canvas)

      resumeRef.current = resume
      resume()

      return () => {
        disposed = true
        stop()
        intersection?.disconnect()
        if (resumeRef.current === resume) resumeRef.current = null
        activeRenderer.dispose()
      }
    },
    // `getSettings`, `isPaused` and `reportError` are Effect Events. React 19
    // recreates them every render, so listing them here would tear down the
    // WebGL context on every slider tick.
    // oxlint-disable-next-line react/preserve-manual-memoization -- intentional: keep the renderer alive across setting changes
    [createRenderer, input],
  )
}
