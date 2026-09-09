'use client'

import { useEffect } from 'react'
import { useStore } from 'jotai'
import { applyPlanetSettingsAtom } from '../showcase/showcase-settings'
import { skyAt, uiExitAt } from './launch-timeline'
import './launch-video.css'

declare global {
  interface Window {
    solarisSkyShot?: { seek: (seconds: number) => void }
  }
}

/** Preloaded real Sky page: its own title, navigation, presets and inspector. */
export function LaunchSkyDirector() {
  const store = useStore()
  useEffect(() => {
    document.documentElement.classList.add('launch-filming')
    document.documentElement.style.setProperty('--launch-title', "'Sky'")
    const gridLabel = Array.from(document.querySelectorAll('label')).find(
      (label) => label.textContent?.trim() === 'Grid',
    )
    if (gridLabel) gridLabel.style.display = 'none'
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('aside, [data-chrome-probe="title"]'),
    )
    const code = document
      .querySelector<HTMLElement>('[data-chrome-probe="code"]')
      ?.closest('section')
    if (code) candidates.push(code)
    // The canvas edge gradient belongs to the background, never the moving chrome.
    const fade = document.querySelector<HTMLElement>('[data-chrome-probe="fade"]')
    const originalFadeOpacity = fade?.style.opacity ?? ''
    const surfaces: { element: HTMLElement; style: string | null; direction: string }[] = []
    for (const element of candidates) {
      if (candidates.some((parent) => parent !== element && parent.contains(element))) continue
      surfaces.push({
        element,
        style: element.getAttribute('style'),
        direction:
          element.tagName === 'ASIDE'
            ? element.getAttribute('aria-label') === 'Celestial objects'
              ? 'left'
              : 'right'
            : 'up',
      })
    }
    window.solarisSkyShot = {
      seek(time) {
        store.set(applyPlanetSettingsAtom, { planetId: 'sky', values: skyAt(time).settings })
        if (fade) fade.style.opacity = String(1 - uiExitAt(time, 'up'))
        for (const { element, direction } of surfaces) {
          const exit = uiExitAt(time, direction)
          const x =
            direction === 'left'
              ? -innerWidth * exit
              : direction === 'right'
                ? innerWidth * exit
                : 0
          const y = direction === 'up' ? -innerHeight * exit : 0
          element.style.transform = `translate(${x}px, ${y}px)`
          element.style.opacity = String(1 - exit)
        }
      },
    }
    window.solarisSkyShot.seek(0)
    return () => {
      delete window.solarisSkyShot
      if (fade) fade.style.opacity = originalFadeOpacity
      document.documentElement.classList.remove('launch-filming')
      document.documentElement.style.removeProperty('--launch-title')
      for (const { element, style } of surfaces) {
        if (style === null) element.removeAttribute('style')
        else element.setAttribute('style', style)
      }
    }
  }, [store])
  return null
}
