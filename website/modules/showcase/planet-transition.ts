import type { Variants } from 'motion/react'

import type { PlanetId } from './showcase-data'

export type PlanetTransitionContext = {
  direction: -1 | 1
  plan: PlanetTransitionPlan
  reducedMotion: boolean
}

export type ChromeTransitionContext = {
  direction: -1 | 1
  reducedMotion: boolean
}

export type PlanetTransitionPlan = {
  duration: number
  /** Fade in place. Used when a full-bleed field would look wrong if it slid. */
  hold?: boolean
}

const linear = 'linear' as const

export function getPlanetTransitionPlan(from: PlanetId, to: PlanetId): PlanetTransitionPlan {
  if (from === 'observed-sun' || to === 'observed-sun') {
    return {
      duration: 0.48,
      hold: true,
    }
  }

  if ((from === 'moon' && to === 'lunar-eclipse') || (from === 'lunar-eclipse' && to === 'moon')) {
    return {
      duration: 0.56,
    }
  }

  return {
    duration: 0.62,
  }
}

function slideTransform(x: number, scale: number, rotation: number): string {
  return `translate3d(${x}%, 0, 0) scale(${scale}) rotateZ(${rotation}deg)`
}

export const planetPreviewVariants: Variants = {
  center: ({ plan, reducedMotion }: PlanetTransitionContext) => {
    if (reducedMotion || plan.hold) {
      return {
        opacity: 1,
        transform: slideTransform(0, 1, 0),
        transition: reducedMotion
          ? { duration: 0.14, ease: linear }
          : { duration: plan.duration, ease: [0.22, 1, 0.36, 1] },
      }
    }

    return {
      opacity: 1,
      transform: slideTransform(0, 1, 0),
      transition: {
        opacity: { delay: plan.duration * 0.08, duration: plan.duration * 0.3, ease: linear },
        transform: { duration: plan.duration, ease: [0.4, 0, 0.2, 1] },
      },
    }
  },
  enter: ({ direction, plan, reducedMotion }: PlanetTransitionContext) => ({
    opacity: 0,
    transform:
      reducedMotion || plan.hold
        ? slideTransform(0, 1, 0)
        : slideTransform(direction * 82, 0.94, direction * 2),
  }),
  exit: ({ direction, plan, reducedMotion }: PlanetTransitionContext) => {
    if (reducedMotion || plan.hold) {
      return {
        opacity: 0,
        transform: slideTransform(0, 1, 0),
        transition: reducedMotion
          ? { duration: 0.14, ease: linear }
          : { duration: plan.duration, ease: [0.22, 1, 0.36, 1] },
      }
    }

    return {
      opacity: [1, 1, 0],
      transform: slideTransform(direction * -82, 0.94, direction * -2),
      transition: {
        opacity: { duration: plan.duration, ease: linear, times: [0, 0.72, 1] },
        transform: { duration: plan.duration, ease: [0.4, 0, 0.2, 1] },
      },
    }
  },
}

const chromeTravel = 12

export const chromeVariants: Variants = {
  center: ({ reducedMotion }: ChromeTransitionContext) => ({
    opacity: 1,
    transform: 'translate3d(0px, 0, 0)',
    transition: reducedMotion
      ? { duration: 0.14, ease: linear }
      : { delay: 0.04, duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  }),
  enter: ({ direction, reducedMotion }: ChromeTransitionContext) => ({
    opacity: 0,
    transform: reducedMotion
      ? 'translate3d(0px, 0, 0)'
      : `translate3d(${direction * chromeTravel}px, 0, 0)`,
  }),
  exit: ({ direction, reducedMotion }: ChromeTransitionContext) => ({
    opacity: 0,
    transform: reducedMotion
      ? 'translate3d(0px, 0, 0)'
      : `translate3d(${direction * -chromeTravel}px, 0, 0)`,
    transition: reducedMotion
      ? { duration: 0.14, ease: linear }
      : { duration: 0.14, ease: [0.22, 1, 0.36, 1] },
  }),
}
