import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { CodeBlock } from './example-code'
import { planetPreviewVariants } from './planet-transition'
import type { ChromeTransitionContext } from './planet-transition'
import { PlanetIntroduction, PlanetPreviewWithSettings } from './planet-preview'
import { useShowcase } from './showcase-context'
import { TextureDocs } from './texture-docs'

export function ShowcasePlanetPage() {
  const {
    completePlanetTransition,
    expandedPreviewActive,
    plan,
    planet,
    previewPlanet,
    transitionDirection,
  } = useShowcase()
  const reduceMotion = useReducedMotion()
  const chromeTransition: ChromeTransitionContext = {
    direction: transitionDirection,
    reducedMotion: Boolean(reduceMotion),
  }

  return (
    <div {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.previewRegion)}>
        <div {...stylex.props(styles.introduction, styles.eclipseIntroductionLighting)}>
          <PlanetIntroduction chrome={chromeTransition} planet={planet} />
        </div>

        <div {...stylex.props(styles.previewStageSpace)} />

        <div
          {...stylex.props(styles.stage, expandedPreviewActive && styles.stageExpanded)}
          aria-label={`${planet.name} shader preview`}
        >
          <AnimatePresence
            custom={{
              direction: transitionDirection,
              plan,
              reducedMotion: Boolean(reduceMotion),
            }}
            initial={false}
            onExitComplete={completePlanetTransition}
          >
            <motion.div
              key={previewPlanet}
              animate="center"
              custom={{
                direction: transitionDirection,
                plan,
                reducedMotion: Boolean(reduceMotion),
              }}
              exit="exit"
              initial="enter"
              variants={planetPreviewVariants}
              {...stylex.props(styles.planetTravelLayer)}
            >
              <div
                {...stylex.props(
                  styles.planetPreviewTransition,
                  (previewPlanet === 'earth' ||
                    previewPlanet === 'moon' ||
                    previewPlanet === 'lunar-eclipse' ||
                    previewPlanet === 'observed-sun') &&
                    styles.planetPreviewTransitionExpanded,
                )}
              >
                <PlanetPreviewWithSettings id={previewPlanet} />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <CodeBlock planet={planet} />
      <TextureDocs planetId={planet.id} />
    </div>
  )
}

const styles = stylex.create({
  eclipseIntroductionLighting: {
    textShadow: 'var(--eclipse-introduction-shadow)',
    transition: 'text-shadow 100ms cubic-bezier(0.23, 1, 0.32, 1)',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  introduction: {
    gridColumn: '1 / span 6',
    minWidth: 0,
    paddingBottom: 20,
    position: 'relative',
    zIndex: 1,
    '@media (max-width: 1279px)': {
      gridColumn: '1 / -1',
    },
  },
  panel: {
    columnGap: 24,
    display: 'grid',
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    marginInline: 'auto',
    maxWidth: 820,
    paddingBottom: 44,
    paddingTop: 'var(--showcase-preview-top)',
    position: 'relative',
    '@media (max-width: 1279px)': {
      columnGap: 16,
    },
    '@media (max-width: 960px)': {
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      paddingBottom: 'calc(148px + env(safe-area-inset-bottom, 0px))',
      paddingTop: 24,
    },
  },
  planetPreviewTransition: {
    bottom: 'calc((clamp(480px, 68vh, 720px) - clamp(360px, 52vh, 590px)) / 2)',
    height: 'clamp(360px, 52vh, 590px)',
    left: 'clamp(24px, 4vw, 64px)',
    position: 'absolute',
    right: 'clamp(24px, 4vw, 64px)',
    transformOrigin: 'center',
  },
  planetPreviewTransitionExpanded: {
    bottom: 0,
    height: 'auto',
    left: 0,
    right: 0,
    top: 0,
  },
  planetTravelLayer: {
    inset: 0,
    position: 'absolute',
    transformOrigin: 'center',
    willChange: 'opacity, transform',
  },
  previewRegion: {
    columnGap: 24,
    display: 'grid',
    gridColumn: '1 / -1',
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    marginInline: 'calc(clamp(24px, 4vw, 64px) * -1)',
    paddingInline: 'clamp(24px, 4vw, 64px)',
    position: 'relative',
    '@media (max-width: 1279px)': {
      columnGap: 16,
    },
    '@media (max-width: 960px)': {
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    },
  },
  previewStageSpace: {
    gridColumn: '1 / -1',
    height: 'clamp(480px, 68vh, 720px)',
    '@media (max-width: 960px)': {
      height: 'clamp(300px, 52dvh, 460px)',
    },
  },
  stage: {
    borderRadius: 14,
    inset: 0,
    overflow: 'visible',
    position: 'absolute',
  },
  stageExpanded: {
    overflow: 'visible',
  },
})
