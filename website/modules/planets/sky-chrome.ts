'use client'

import { useLayoutEffect, useState } from 'react'

import {
  chromeInk,
  noneTextLighting,
  type ChromeInkProperties,
  type EclipseTextLightingProperties,
} from '../showcase/chrome-ink'

export type SkyLighting = {
  exposure: number
  field: number
  glare: number
  haze: number
  ozone: number
  sunElevation: number
  sunScale: number
}

type Vec3 = readonly [number, number, number]
type ScreenPoint = { x: number; y: number }
type ScreenRect = { bottom: number; left: number; right: number; top: number }

const SUN_RADIUS = 0.2665
const SKY_GAIN = 0.22
const LUMINANCE: Vec3 = [0.2126, 0.7152, 0.0722]
const TAU_RAYLEIGH: Vec3 = [0.05, 0.098, 0.218]
const TAU_AEROSOL: Vec3 = [0.045, 0.05, 0.06]
const TAU_OZONE: Vec3 = [0.012, 0.035, 0.0016]
const INDIGO_FIELD: Vec3 = [0.016, 0.014, 0.032]
const GLARE_TINT: Vec3 = [1, 0.8, 0.46]
const PI = Math.PI

const NAV_FALLBACK: ScreenRect = { bottom: -1.4, left: -2.7, right: -1.9, top: 1.6 }
const TITLE_FALLBACK: ScreenRect = { bottom: 0.9, left: -0.9, right: 0.5, top: 1.6 }
const CODE_FALLBACK: ScreenRect = { bottom: -2.1, left: -0.8, right: 0.8, top: -1.5 }
// The code header sits on `rgba(7, 8, 13, 0.55)` (see codeSectionFlat), so the
// sky shows through at 45% over a near-black fill. Display-luminance terms.
const CODE_FILL_PASS = 0.45
const CODE_FILL_LUMINANCE = 0.001

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}

function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function exp3(a: Vec3): Vec3 {
  return [Math.exp(a[0]), Math.exp(a[1]), Math.exp(a[2])]
}

function div3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] / Math.max(b[0], 1e-5), a[1] / Math.max(b[1], 1e-5), a[2] / Math.max(b[2], 1e-5)]
}

function mul3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]]
}

function airmass(elevationDegrees: number): number {
  const height = Math.max(elevationDegrees, 0)
  return 1 / (Math.sin((height * PI) / 180) + 0.50572 * (height + 6.07995) ** -1.6364)
}

function opticalDepth(haze: number, ozone: number): Vec3 {
  return add(
    add(TAU_RAYLEIGH, scale(TAU_AEROSOL, 0.3 + 2.2 * clamp01(haze))),
    scale(TAU_OZONE, ozone),
  )
}

function transmittance(depth: Vec3, elevationDegrees: number): Vec3 {
  return exp3(scale(depth, -airmass(elevationDegrees)))
}

function rayleighPhase(mu: number): number {
  return (3 / (16 * PI)) * (1 + mu * mu)
}

function miePhase(mu: number, haze: number): number {
  const g = 0.65 + 0.17 * clamp01(haze)
  const gg = g * g
  const num = 3 * (1 - gg) * (1 + mu * mu)
  const den = 8 * PI * (2 + gg) * Math.max(1 + gg - 2 * g * mu, 1e-4) ** 1.5
  return num / den
}

function acesChannel(value: number): number {
  return (value * (2.51 * value + 0.03)) / (value * (2.43 * value + 0.59) + 0.14)
}

function acesToneMap(color: Vec3): Vec3 {
  return [
    clamp01(acesChannel(color[0])),
    clamp01(acesChannel(color[1])),
    clamp01(acesChannel(color[2])),
  ]
}

function washFromLuminance(luminance: number): number {
  // Cream ink fails on a sunset plate long before the sky reads as white.
  if (luminance <= 0.08) return 0
  if (luminance >= 0.2) return 1
  const t = (luminance - 0.08) / 0.12
  return t * t * (3 - 2 * t)
}

/**
 * Display luminance of the Sky shader at a composition-space point.
 * Matches the sky / glare / horizon path; skips seeing, streaks, and flare noise.
 */
export function skyBackdropLuminance(lighting: SkyLighting, screen: ScreenPoint): number {
  const sunScale = Math.max(lighting.sunScale, 1e-4)
  const angularX = screen.x * (SUN_RADIUS / sunScale)
  const angularY = screen.y * (SUN_RADIUS / sunScale)
  const angularLength = Math.hypot(angularX, angularY)
  const viewElevation = lighting.sunElevation + angularY
  const depth = opticalDepth(lighting.haze, lighting.ozone)
  const sunTransmittance = transmittance(depth, lighting.sunElevation)
  const centreLuminance = Math.max(dot(sunTransmittance, LUMINANCE), 1e-5)
  const viewTransmittance = transmittance(depth, viewElevation)
  const mu = Math.cos((angularLength * PI) / 180)
  const scatterCoeff = add(
    scale(TAU_RAYLEIGH, rayleighPhase(mu)),
    scale(TAU_AEROSOL, (0.3 + 2.2 * clamp01(lighting.haze)) * miePhase(mu, lighting.haze)),
  )
  const skyLightFactor = smoothstep(-9, 3.5, lighting.sunElevation)
  const skyScatter = scale(
    mul3(
      div3(scatterCoeff, depth),
      mul3(add([1, 1, 1], scale(viewTransmittance, -1)), sunTransmittance),
    ),
    (SKY_GAIN * skyLightFactor) / centreLuminance,
  )
  const sky = mix3(INDIGO_FIELD, skyScatter, clamp01(lighting.field))
  const horizonSoft = 0.02 + lighting.haze * 1.2
  const horizonMask =
    1 -
    clamp01(lighting.field) +
    smoothstep(-horizonSoft, horizonSoft, viewElevation) * clamp01(lighting.field)
  const ground = add(scale(sky, 0.025), [0.004, 0.003, 0.004])
  const outsideEdge = Math.max(angularLength - SUN_RADIUS, 0)
  const glareWidth = 0.05 + 0.22 * clamp01(lighting.haze)
  const glareGauss = Math.exp(-((outsideEdge / glareWidth) ** 2))
  const glareWings = 0.012 / (outsideEdge + 0.15) ** 2 + 0.0015 / (outsideEdge + 0.15) ** 3
  const directSunFactor = smoothstep(-4.5, 1.7, lighting.sunElevation)
  const sunTint = scale(sunTransmittance, 1 / centreLuminance)
  const glowTint = mul3(sunTint, GLARE_TINT)
  const glare = scale(
    glowTint,
    lighting.glare *
      (0.42 * glareGauss +
        glareWings * (0.2 + 0.8 * clamp01(lighting.field)) +
        0.015 * clamp01(lighting.field)) *
      directSunFactor,
  )
  const scene = add(mix3(ground, sky, horizonMask), glare)
  const mapped = acesToneMap(scale(scene, lighting.exposure * 0.45))
  return dot(mapped, LUMINANCE)
}

export function skyRegionWash(lighting: SkyLighting, screen: ScreenPoint): number {
  return washFromLuminance(skyBackdropLuminance(lighting, screen))
}

function compositionBounds(element: Element, composition: DOMRect): ScreenRect | null {
  const rect = element.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return null
  const scale = Math.max(Math.min(composition.width, composition.height), 1)
  const centerX = composition.left + composition.width / 2
  const centerY = composition.top + composition.height / 2
  return {
    bottom: (2 * (centerY - rect.bottom)) / scale,
    left: (2 * (rect.left - centerX)) / scale,
    right: (2 * (rect.right - centerX)) / scale,
    top: (2 * (centerY - rect.top)) / scale,
  }
}

/** Vertical band (composition y) covered by the bottom fade-out gradient. */
type FadeBand = { bottom: number; top: number }

/** Height of the bottom fade-out band in CSS px. */
export const SKY_FADE_HEIGHT = 240

/**
 * Coverage of the page background over the sky, `t` running 0 → 1 from the
 * top of the fade band to its bottom. Squared smoothstep: zero slope at both
 * ends so neither edge of the band reads as a line, with the midpoint pushed
 * toward the bottom so most of the band still shows sky.
 */
export function skyFadeCover(t: number): number {
  const s = smoothstep(0, 1, t)
  return s * s
}

/** CSS gradient that samples {@link skyFadeCover}, for the fade overlay. */
export function skyFadeGradient(): string {
  const stops: string[] = []
  const steps = 12
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    stops.push(`rgba(7, 8, 13, ${skyFadeCover(t).toFixed(4)}) ${(t * 100).toFixed(2)}%`)
  }
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

function regionWash(
  lighting: SkyLighting,
  region: ScreenRect,
  // Maps the raw sky luminance to what is actually seen behind the text, e.g.
  // through a translucent fill or the bottom fade.
  seen: (luminance: number, point: ScreenPoint) => number = (luminance) => luminance,
): number {
  let maxWash = 0
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      const x = region.left + ((region.right - region.left) * column) / 2
      const y = region.bottom + ((region.top - region.bottom) * row) / 2
      const point = { x, y }
      maxWash = Math.max(
        maxWash,
        washFromLuminance(Math.min(1, seen(skyBackdropLuminance(lighting, point), point))),
      )
    }
  }
  return maxWash
}

/** Attenuates the sky by the bottom gradient (transparent at top, opaque at bottom). */
function throughFade(luminance: number, y: number, fade: FadeBand | null): number {
  if (!fade || fade.top <= fade.bottom) return luminance
  const cover = skyFadeCover((fade.top - y) / (fade.top - fade.bottom))
  return luminance * (1 - cover)
}

function throughCodeFill(luminance: number, point: ScreenPoint, fade: FadeBand | null): number {
  return throughFade(luminance, point.y, fade) * CODE_FILL_PASS + CODE_FILL_LUMINANCE
}

/**
 * Selector for elements that want their own adaptive ink. Any element with
 * `data-sky-ink` is measured against the sky directly behind it and receives
 * the full set of `--showcase-*-ink` variables inline, so its own styles just
 * reference the variable they need.
 */
export const SKY_INK_SELECTOR = '[data-sky-ink]'

/**
 * Ancestors marked with this attribute are opaque surfaces (e.g. the mobile
 * sheet); `[data-sky-ink]` elements inside them are not sampled and keep the
 * variables their container provides.
 */
const SKY_INK_OPAQUE_SELECTOR = '[data-sky-ink-opaque]'

export type SkyChromeProbes = {
  code: ScreenRect
  fade: FadeBand | null
  /** One entry per `[data-sky-ink]` element in DOM order; null when not laid out. */
  inkElements: (ScreenRect | null)[]
  nav: ScreenRect
  title: ScreenRect
}

const EMPTY_RECTS: (ScreenRect | null)[] = []

export function useSkyChromeProbes(enabled: boolean): SkyChromeProbes {
  const [probes, setProbes] = useState<SkyChromeProbes>({
    code: CODE_FALLBACK,
    fade: null,
    inkElements: EMPTY_RECTS,
    nav: NAV_FALLBACK,
    title: TITLE_FALLBACK,
  })

  useLayoutEffect(() => {
    if (!enabled) return

    function measure(): void {
      const composition = document.querySelector('[data-solaris-composition]')
      const nav = document.querySelector('[data-chrome-probe="nav"]')
      const title = document.querySelector('[data-chrome-probe="title"]')
      const code = document.querySelector('[data-chrome-probe="code"]')
      const fade = document.querySelector('[data-chrome-probe="fade"]')
      const inkElements = document.querySelectorAll(SKY_INK_SELECTOR)
      if (!composition || !nav || !title) return
      const compositionRect = composition.getBoundingClientRect()
      if (compositionRect.width < 2 || compositionRect.height < 2) return
      const navScreen = compositionBounds(nav, compositionRect)
      const titleScreen = compositionBounds(title, compositionRect)
      const codeScreen = code ? compositionBounds(code, compositionRect) : null
      const fadeScreen = fade ? compositionBounds(fade, compositionRect) : null
      const inkScreens: (ScreenRect | null)[] = []
      for (const element of inkElements) {
        inkScreens.push(
          element.closest(SKY_INK_OPAQUE_SELECTOR)
            ? null
            : compositionBounds(element, compositionRect),
        )
      }
      setProbes((current) => ({
        code: codeScreen ?? current.code,
        fade: fadeScreen ? { bottom: fadeScreen.bottom, top: fadeScreen.top } : current.fade,
        inkElements: inkScreens,
        nav: navScreen ?? current.nav,
        title: titleScreen ?? current.title,
      }))
    }

    // The chrome is fixed while the canvas scrolls with the page, and the
    // inspector scrolls internally, so geometry changes on any scroll.
    // Capture catches nested scrollers; coalesce to one read per frame.
    let scrollFrame = 0
    function onScroll(): void {
      if (scrollFrame) return
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0
        measure()
      })
    }

    measure()
    const frame = window.requestAnimationFrame(measure)
    const later = window.setTimeout(measure, 160)
    const observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)
    for (const selector of [
      '[data-solaris-composition]',
      '[data-chrome-probe="nav"]',
      '[data-chrome-probe="title"]',
      '[data-chrome-probe="code"]',
      '[data-chrome-probe="fade"]',
    ]) {
      const element = document.querySelector(selector)
      if (element) observer.observe(element)
    }
    window.addEventListener('resize', measure)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(scrollFrame)
      window.clearTimeout(later)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      document.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [enabled])

  return probes
}

export function skyChromeStyle(
  lighting: SkyLighting,
  probes: SkyChromeProbes,
): EclipseTextLightingProperties {
  const codeInk = chromeInk(
    regionWash(lighting, probes.code, (luminance, point) =>
      throughCodeFill(luminance, point, probes.fade),
    ),
  )
  const seen = (luminance: number, point: ScreenPoint) =>
    throughFade(luminance, point.y, probes.fade)
  const navInk = chromeInk(regionWash(lighting, probes.nav, seen))
  const titleInk = chromeInk(regionWash(lighting, probes.title, seen))
  return {
    ...noneTextLighting(),
    '--showcase-code-ink': codeInk['--showcase-code-ink'],
    '--showcase-code-ink-hover': codeInk['--showcase-code-ink-hover'],
    '--showcase-code-ink-strong': codeInk['--showcase-code-ink-strong'],
    '--showcase-label-ink': navInk['--showcase-label-ink'],
    '--showcase-nav-ink': navInk['--showcase-nav-ink'],
    '--showcase-nav-ink-hover': navInk['--showcase-nav-ink-hover'],
    '--showcase-nav-ink-strong': navInk['--showcase-nav-ink-strong'],
    '--showcase-summary-ink': titleInk['--showcase-summary-ink'],
    '--showcase-title-bottom': titleInk['--showcase-title-bottom'],
    '--showcase-title-top': titleInk['--showcase-title-top'],
  }
}

/**
 * Per-element ink for every `[data-sky-ink]` element, aligned with
 * `probes.inkElements`. Regions like the sidebar span from bright sky to the
 * dark page below the canvas, so a single ink per region cannot work; each
 * opted-in element is judged against the sky directly behind it. Null means
 * the element is not laid out (e.g. hidden on this breakpoint).
 */
export function skyInkElements(
  lighting: SkyLighting,
  probes: SkyChromeProbes,
): (ChromeInkProperties | null)[] {
  return probes.inkElements.map((rect) => {
    if (!rect) return null
    return chromeInk(
      regionWash(lighting, rect, (luminance, point) =>
        throughFade(luminance, point.y, probes.fade),
      ),
    )
  })
}
