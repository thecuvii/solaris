import type { CSSProperties } from 'react'

export type ChromeInkProperties = {
  '--showcase-nav-ink': string
  '--showcase-nav-ink-hover': string
  '--showcase-nav-ink-strong': string
  '--showcase-summary-ink': string
  '--showcase-title-bottom': string
  '--showcase-title-top': string
}

export type EclipseTextLightingProperties = CSSProperties &
  ChromeInkProperties & {
    '--eclipse-introduction-filter': string
    '--eclipse-introduction-shadow': string
    '--eclipse-navigation-filter': string
  }

const LIGHT_CHROME_INK: ChromeInkProperties = {
  '--showcase-nav-ink': 'rgba(242, 232, 208, 0.42)',
  '--showcase-nav-ink-hover': 'rgba(242, 232, 208, 0.76)',
  '--showcase-nav-ink-strong': '#f2e8d0',
  '--showcase-summary-ink': 'rgba(242, 232, 208, 0.42)',
  '--showcase-title-bottom': 'color(display-p3 0.8787 0.8708 0.8589)',
  '--showcase-title-top': 'color(display-p3 1 1 1)',
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function inkMix(wash: number, light: string, dark: string): string {
  const amount = clamp01(wash)
  if (amount <= 0.001) return light
  if (amount >= 0.999) return dark
  return `color-mix(in oklch, ${light} ${((1 - amount) * 100).toFixed(1)}%, ${dark} ${(amount * 100).toFixed(1)}%)`
}

const DARK_CHROME_INK: ChromeInkProperties = {
  '--showcase-nav-ink': 'oklch(11% 0.01 80 / 0.82)',
  '--showcase-nav-ink-hover': 'oklch(8% 0.01 80 / 0.94)',
  '--showcase-nav-ink-strong': 'oklch(8% 0.012 80)',
  '--showcase-summary-ink': 'oklch(11% 0.01 80 / 0.86)',
  '--showcase-title-bottom': 'oklch(9% 0.01 80)',
  '--showcase-title-top': 'oklch(13% 0.012 80)',
}

export function chromeInk(wash: number): ChromeInkProperties {
  if (wash <= 0.001) return LIGHT_CHROME_INK
  if (wash >= 0.999) return DARK_CHROME_INK
  return {
    '--showcase-nav-ink': inkMix(
      wash,
      LIGHT_CHROME_INK['--showcase-nav-ink'],
      DARK_CHROME_INK['--showcase-nav-ink'],
    ),
    '--showcase-nav-ink-hover': inkMix(
      wash,
      LIGHT_CHROME_INK['--showcase-nav-ink-hover'],
      DARK_CHROME_INK['--showcase-nav-ink-hover'],
    ),
    '--showcase-nav-ink-strong': inkMix(
      wash,
      LIGHT_CHROME_INK['--showcase-nav-ink-strong'],
      DARK_CHROME_INK['--showcase-nav-ink-strong'],
    ),
    '--showcase-summary-ink': inkMix(
      wash,
      LIGHT_CHROME_INK['--showcase-summary-ink'],
      DARK_CHROME_INK['--showcase-summary-ink'],
    ),
    '--showcase-title-bottom': inkMix(
      wash,
      LIGHT_CHROME_INK['--showcase-title-bottom'],
      DARK_CHROME_INK['--showcase-title-bottom'],
    ),
    '--showcase-title-top': inkMix(
      wash,
      LIGHT_CHROME_INK['--showcase-title-top'],
      DARK_CHROME_INK['--showcase-title-top'],
    ),
  }
}

export function noneTextLighting(): EclipseTextLightingProperties {
  return {
    ...LIGHT_CHROME_INK,
    '--eclipse-introduction-filter': 'none',
    '--eclipse-introduction-shadow': 'none',
    '--eclipse-navigation-filter': 'none',
  }
}

export function buildTextLighting({
  haloEnergy,
  offsetX,
  offsetY,
  rimHue,
}: {
  haloEnergy: number
  offsetX: number
  offsetY: number
  rimHue: number
}): EclipseTextLightingProperties {
  if (haloEnergy === 0) return noneTextLighting()

  const visibleHaloResponse = (1 - Math.exp(-6 * haloEnergy)) / (1 - Math.exp(-6))
  const shadowDistance = 0.6 + haloEnergy * 1.3
  const shadowAlpha = visibleHaloResponse * (0.3 + haloEnergy * 0.22)
  const rimAlpha = visibleHaloResponse * 0.18
  const navigationRimAlpha = visibleHaloResponse * 0.22
  const rimScale = (0.25 + visibleHaloResponse * 0.35) / shadowDistance
  const detailShadowScale = 0.65
  const navigationShadowScale = 0.75
  const horizontalBias = Math.min(Math.max(offsetX / 2.5, -1), 1)
  const verticalBias = Math.min(Math.max(-offsetY / 2.5, -1), 1)
  const introductionShadowX = -shadowDistance * (0.28 + horizontalBias * 0.22)
  const introductionShadowY = -shadowDistance * (0.72 + verticalBias * 0.28)
  const navigationShadowX = -shadowDistance * (0.72 + horizontalBias * 0.28)
  const navigationShadowY = shadowDistance * 0.08
  const shadowBlur = 0.35 + haloEnergy * 0.45
  const rimBlur = 0.15 + haloEnergy * 0.2
  const rim = `oklch(86% 0.08 ${rimHue}`

  return {
    ...LIGHT_CHROME_INK,
    '--eclipse-introduction-filter': `drop-shadow(${introductionShadowX.toFixed(2)}px ${introductionShadowY.toFixed(2)}px ${shadowBlur.toFixed(2)}px oklch(0% 0 0 / ${shadowAlpha.toFixed(3)})) drop-shadow(${(-introductionShadowX * rimScale).toFixed(2)}px ${(-introductionShadowY * rimScale).toFixed(2)}px ${rimBlur.toFixed(2)}px ${rim} / ${rimAlpha.toFixed(3)}))`,
    '--eclipse-introduction-shadow': `${(introductionShadowX * detailShadowScale).toFixed(2)}px ${(introductionShadowY * detailShadowScale).toFixed(2)}px ${shadowBlur.toFixed(2)}px oklch(0% 0 0 / ${shadowAlpha.toFixed(3)}), ${(-introductionShadowX * rimScale * detailShadowScale).toFixed(2)}px ${(-introductionShadowY * rimScale * detailShadowScale).toFixed(2)}px ${rimBlur.toFixed(2)}px ${rim} / ${rimAlpha.toFixed(3)})`,
    '--eclipse-navigation-filter': `drop-shadow(${(navigationShadowX * navigationShadowScale).toFixed(2)}px ${(navigationShadowY * navigationShadowScale).toFixed(2)}px ${shadowBlur.toFixed(2)}px oklch(0% 0 0 / ${shadowAlpha.toFixed(3)})) drop-shadow(${(-navigationShadowX * rimScale * navigationShadowScale).toFixed(2)}px ${(-navigationShadowY * rimScale * navigationShadowScale).toFixed(2)}px ${rimBlur.toFixed(2)}px ${rim} / ${navigationRimAlpha.toFixed(3)}))`,
  }
}
