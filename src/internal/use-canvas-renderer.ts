import { useCallback, useEffectEvent, type RefCallback } from 'react'

export type CanvasRenderer<Settings> = {
  dispose: () => void
  render: (timestamp: number, settings: Settings) => void
}

export function useCanvasRenderer<Settings, Input>(
  settings: Settings,
  input: Input,
  createRenderer: (
    canvas: HTMLCanvasElement,
    input: Input,
    getSettings: () => Settings,
  ) => CanvasRenderer<Settings> | null,
): RefCallback<HTMLCanvasElement> {
  const getSettings = useEffectEvent(() => settings)

  return useCallback<RefCallback<HTMLCanvasElement>>(
    (canvas) => {
      if (!canvas) return
      const renderer = createRenderer(canvas, input, getSettings)
      if (!renderer) return
      const activeRenderer = renderer

      let disposed = false
      let frameId = 0

      function frame(timestamp: number): void {
        activeRenderer.render(timestamp, getSettings())
        if (!disposed) frameId = requestAnimationFrame(frame)
      }

      frameId = requestAnimationFrame(frame)

      return () => {
        disposed = true
        cancelAnimationFrame(frameId)
        activeRenderer.dispose()
      }
    },
    // `getSettings` is an Effect Event. React 19 recreates that function every
    // render, so listing it here tears down the WebGL context on every slider tick.
    // oxlint-disable-next-line react/preserve-manual-memoization -- intentional: keep the renderer alive across setting changes
    [createRenderer, input],
  )
}
