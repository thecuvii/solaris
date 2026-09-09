import { mix, progress, skyStart } from './launch-timeline'

function center(element: Element | null) {
  const rect = element?.getBoundingClientRect()
  return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : { x: 0, y: 0 }
}

/** The filmed pointer follows the actual controls' measured positions. */
export function positionLaunchCursor(time: number, preset: HTMLElement, panel: HTMLElement) {
  const cursor = document.querySelector<HTMLElement>('.launch-cursor')
  if (!cursor) return
  const buttons = preset.querySelectorAll('button')
  const day = center(buttons[0] ?? null)
  const dusk = center(buttons[1] ?? null)
  const night = center(buttons[2] ?? null)
  const thumb = center(
    panel.querySelector('[role="group"][aria-label^="Azimuth"]')?.lastElementChild ?? null,
  )
  const slider = panel.querySelector('[aria-label="City lights"]')?.getBoundingClientRect()
  const lights = progress(time, 3.15, 3.8)
  const sliderPoint = slider
    ? { x: slider.x + 14 + (slider.width - 28) * lights, y: slider.y + slider.height / 2 }
    : thumb
  const between = (a: typeof day, b: typeof day, amount: number) => ({
    x: mix(a.x, b.x, amount),
    y: mix(a.y, b.y, amount),
  })
  let point = between(day, night, progress(time, 0.35, 0.72))
  if (time >= 0.75) point = between(night, dusk, progress(time, 1, 1.37))
  if (time >= 1.4) point = between(dusk, thumb, progress(time, 1.9, 2.2))
  if (time >= 2.95) point = between(thumb, sliderPoint, progress(time, 2.95, 3.15))
  if (time >= 21.7) {
    const sky = center(
      document.querySelector('aside[aria-label="Celestial objects"] nav a[href="/sky/"]') ??
        document.querySelector('aside[aria-label="Celestial objects"] nav a[href="/sky"]'),
    )
    point = between(
      { x: innerWidth * 0.45, y: innerHeight * 0.5 },
      sky,
      progress(time, 21.85, skyStart - 0.08),
    )
  }
  const clicked = [skyStart, 0.04, 0.75, 1.4].some((t) => time >= t && time < t + 0.13)
  const dragging = (time >= 2.2 && time <= 2.95) || (time >= 3.15 && time <= 3.8)
  cursor.style.transform = `translate(${point.x}px, ${point.y}px) scale(${clicked || dragging ? 0.88 : 1})`
  cursor.style.opacity = String(
    time >= 21.7
      ? progress(time, 21.7, 21.9) * (1 - progress(time, skyStart + 0.12, skyStart + 0.35))
      : 1 - progress(time, 3.85, 4.1),
  )
  cursor.dataset.pressed = String(clicked || dragging)
}
