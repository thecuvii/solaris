import { useEffect, useEffectEvent, type RefObject } from 'react'

export type CanvasRenderer<Settings> = {
  dispose: () => void
  render: (timestamp: number, settings: Settings) => void
}

export function useCanvasRenderer<Settings, Input>(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  settings: Settings,
  input: Input,
  createRenderer: (
    canvas: HTMLCanvasElement,
    input: Input,
    getSettings: () => Settings,
  ) => CanvasRenderer<Settings> | null,
): void {
  const getSettings = useEffectEvent(() => settings)

  useEffect(() => {
    const canvas = canvasRef.current
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
  }, [canvasRef, createRenderer, input])
}
