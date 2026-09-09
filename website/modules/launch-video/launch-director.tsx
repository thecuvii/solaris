'use client'

import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useStore } from 'jotai'

import { applyPlanetSettingsAtom, planetSettingsAtom } from '../showcase/showcase-settings'
import {
  mix,
  progress,
  shotAt,
  shotDuration,
  pullbackStart,
  montageScale,
  montageCenterY,
  railScale,
  shadowStart,
  railPlanets,
  settle,
  skyStart,
} from './launch-timeline'
import { LaunchQuickCuts } from './launch-quick-cuts'
import { LaunchOverlays } from './launch-overlays'
import { positionLaunchBrand } from './launch-brand-motion'
import { positionLaunchCursor } from './launch-cursor'
import { launchTimeAtom } from './launch-playback-state'
import './launch-video.css'

declare global {
  interface Window {
    solarisShot?: { seek: (seconds: number) => void; play: () => void; duration: number }
  }
}

/** A filming-only director. The Earth, presets, inspector and code are the live website. */
export function LaunchDirector() {
  const store = useStore()

  useEffect(() => {
    const originalSettings = { ...store.get(planetSettingsAtom('earth')) }
    const savedStyles = new Map<HTMLElement, string | null>()
    let animation = 0
    let disposed = false
    const save = (element: HTMLElement) => {
      if (!savedStyles.has(element)) savedStyles.set(element, element.getAttribute('style'))
      return element
    }
    const wordmark = document.createElement('div')
    wordmark.className = 'launch-wordmark'
    wordmark.innerHTML = '<span></span>Solaris'
    const hint = document.createElement('button')
    hint.className = 'launch-replay'
    hint.textContent = 'Replay ↗'
    hint.type = 'button'
    document.body.append(wordmark, hint)
    document.documentElement.classList.remove('launch-ready')
    document.documentElement.classList.add('launch-filming')

    const initialize = () => {
      const canvas = document.querySelector<HTMLCanvasElement>('main canvas')
      const composition = canvas?.parentElement?.previousElementSibling
      const presetGrid = document.querySelector<HTMLElement>('[aria-label="Preset"]')
      const preset = presetGrid?.parentElement
      const inspector = preset?.closest('aside')
      if (!(composition instanceof HTMLElement) || !preset || !inspector || !canvas) return false
      const compositionElement = composition
      const presetElement = preset
      const lightGroup = Array.from(inspector.querySelectorAll('section')).find(
        (section) => section.querySelector('h2')?.textContent === 'Light',
      )
      if (!lightGroup) return false
      const panel = lightGroup
      save(panel)
      const panelBase = panel.getBoundingClientRect()
      const presetHeading = preset.querySelector('h2')?.parentElement
      if (presetHeading) save(presetHeading)

      save(composition)
      save(preset)
      save(inspector)
      inspector.style.overflow = 'visible'
      const gridLabel = Array.from(document.querySelectorAll('label')).find(
        (label) => label.textContent?.trim() === 'Grid',
      )
      if (gridLabel) save(gridLabel).style.display = 'none'
      const base = composition.getBoundingClientRect()
      const parent = composition.offsetParent!.getBoundingClientRect()
      const presetBase = preset.getBoundingClientRect()
      const chrome = [
        ...document.querySelectorAll<HTMLElement>(
          'aside[aria-label="Celestial objects"], [data-chrome-probe="title"], [data-chrome-probe="fade"]',
        ),
        ...Array.from(inspector.children)
          .flatMap((child) => Array.from(child.children))
          .filter((child) => child !== preset && child !== panel),
        ...Array.from(document.querySelector('main')!.firstElementChild!.children).slice(1),
      ].filter((element): element is HTMLElement => element instanceof HTMLElement)
      chrome.forEach(save)
      const candidates = Array.from(new Set([...chrome, inspector]))
      const exitSurfaces = candidates
        .filter(
          (element) => !candidates.some((parent) => parent !== element && parent.contains(element)),
        )
        .map((element) => ({
          element,
          transform: element.style.transform,
          direction: element === inspector ? 'right' : element.tagName === 'ASIDE' ? 'left' : 'up',
        }))
      exitSurfaces.forEach(({ element }) => {
        save(element)
        element.style.zIndex = '10'
      })
      inspector.style.zIndex = '10'
      const buttons = Array.from(presetGrid.querySelectorAll('button'))
      buttons.forEach(save)
      const background = canvas.parentElement!
      save(background)
      const earthLayer = save(background.parentElement!)
      background.style.pointerEvents = 'none'
      const w = window.innerWidth
      const h = window.innerHeight

      function seek(seconds: number) {
        const t = Math.max(0, Math.min(shotDuration, seconds))
        const state = shotAt(t)
        exitSurfaces.forEach(({ element, transform }) => {
          element.style.transform = transform
        })
        flushSync(() => {
          store.set(applyPlanetSettingsAtom, { planetId: 'earth', values: state.settings })
          store.set(launchTimeAtom, t)
        })
        const pull = state.pullback
        const montage = settle(t, 3.95, 4.6)
        const startSize = h * 2.3 * mix(1, t < shadowStart ? railScale : montageScale, montage)
        const width = mix(startSize, base.width, pull)
        const height = mix(startSize, base.height, pull)
        const centerX = mix(w / 2, base.x + base.width / 2, pull)
        const centerY = mix(h * mix(1.34, montageCenterY, montage), base.y + base.height / 2, pull)
        Object.assign(compositionElement.style, {
          width: `${width}px`,
          height: `${height}px`,
          left: `${centerX - parent.left}px`,
          top: `${centerY - parent.top - height / 2}px`,
          bottom: 'auto',
        })
        // The renderer observes size changes; this also invalidates pure position changes.
        window.dispatchEvent(new Event('resize'))
        const returned = t >= pullbackStart
        const scale = returned ? 1 : 2.4
        const x = returned ? 0 : (w - 188 * scale) / 2 - presetBase.left
        const y = returned ? 0 : h * 0.16 - presetBase.top
        if (presetHeading) presetHeading.style.justifyContent = returned ? '' : 'center'
        Object.assign(presetElement.style, {
          width: returned ? `${presetBase.width}px` : '188px',
          transformOrigin: 'top left',
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          opacity: String(returned ? state.reveal : 1 - progress(t, 1.85, 2.05)),
        })
        buttons.forEach((button, index) => {
          button.style.opacity = String(
            t > 2.25 ? mix(0.6, 1, pull) : index === state.presetIndex ? 1 : 0.4,
          )
          button.style.filter =
            index === state.presetIndex && t < 2.25 ? 'drop-shadow(0 0 9px #99bcdf55)' : 'none'
        })
        chrome.forEach((element) => {
          element.style.opacity = String(state.reveal)
          if (returned) element.style.transform = `translateY(${(1 - state.reveal) * 18}px)`
        })
        panel.style.opacity = String(
          returned ? state.reveal : state.panel * (1 - progress(t, 3.95, 4.35)),
        )
        panel.style.transformOrigin = 'top left'
        panel.style.transform = returned
          ? `translateY(${(1 - state.reveal) * 18}px)`
          : `translate(${w - 72 - panelBase.width * 1.4 - panelBase.left + progress(t, 3.95, 4.35) * 140}px, ${100 - panelBase.top}px) scale(1.4)`
        positionLaunchCursor(t, presetElement, panel)
        wordmark.style.opacity = String(state.wordmarkOpacity * 0.85)
        background.style.opacity = String(
          state.earthOpacity * (1 - progress(t, skyStart, skyStart + 0.28)),
        )
        earthLayer.style.transform = 'none'
        document.querySelectorAll<HTMLElement>('[data-launch-cut]').forEach((element) => {
          const body = element.dataset.launchCut as (typeof railPlanets)[number]
          element.style.background = state.rail ? 'transparent' : '#07080d'
          element.style.transform = 'none'
          element.style.opacity = body === state.quickCut ? String(state.cutOpacity) : '0'
        })
        const skyFrame = document.querySelector<HTMLIFrameElement>('.launch-sky iframe')
        skyFrame?.contentWindow?.solarisSkyShot?.seek(t)
        positionLaunchBrand(t)
        if (t >= skyStart) {
          for (const { element } of exitSurfaces) {
            element.style.opacity = String(1 - progress(t, skyStart, skyStart + 0.28))
          }
        }
        hint.style.opacity = t >= shotDuration ? '1' : '0'
        hint.style.pointerEvents = t >= shotDuration ? 'auto' : 'none'
      }

      function play() {
        cancelAnimationFrame(animation)
        const start = performance.now()
        function frame(now: number) {
          if (disposed) return
          const t = (now - start) / 1000
          seek(t)
          if (t < shotDuration) animation = requestAnimationFrame(frame)
        }
        animation = requestAnimationFrame(frame)
      }
      window.solarisShot = { seek, play, duration: shotDuration }
      hint.onclick = play
      seek(0)
      return true
    }

    const ready = async () => {
      await document.fonts.ready
      // Compile/upload before the first filmed frame. Capture additionally checks canvas readiness.
      await new Promise((resolve) => setTimeout(resolve, 1800))
      if (disposed) return
      if (!initialize()) return
      // Give the resized shader its first frame before revealing the staged UI.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      while (
        !disposed &&
        document.querySelector<HTMLCanvasElement>('main canvas')?.style.opacity !== '1'
      ) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      if (disposed) return
      document.documentElement.classList.add('launch-ready')
      if (!new URLSearchParams(window.location.search).has('capture')) window.solarisShot?.play()
    }
    void ready()
    return () => {
      disposed = true
      cancelAnimationFrame(animation)
      delete window.solarisShot
      savedStyles.forEach((value, element) => {
        if (value === null) element.removeAttribute('style')
        else element.setAttribute('style', value)
      })
      wordmark.remove()
      hint.remove()
      document.documentElement.classList.remove('launch-filming', 'launch-ready')
      store.set(applyPlanetSettingsAtom, { planetId: 'earth', values: originalSettings })
    }
  }, [store])

  return (
    <>
      <LaunchQuickCuts />
      <LaunchOverlays />
    </>
  )
}
