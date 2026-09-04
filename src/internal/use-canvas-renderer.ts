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
    [createRenderer, getSettings, input],
  )
}
