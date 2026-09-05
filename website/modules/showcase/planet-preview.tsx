import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, motion } from 'motion/react'
import { TextMorph } from 'torph/react'

import { chromeVariants } from './planet-transition'
import type { ChromeTransitionContext } from './planet-transition'
import { githubSourceUrl, type Planet } from './showcase-data'
import { track } from './track'

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.sourceIcon)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
    </svg>
  )
}

export function PlanetIntroduction({
  chrome,
  planet,
}: {
  chrome: ChromeTransitionContext
  planet: Planet
}) {
  const titleProps = stylex.props(styles.title, styles.eclipseTitleLighting)

  return (
    <>
      <div {...stylex.props(styles.titleRow)}>
        <TextMorph
          as="h1"
          className={[titleProps.className, 'showcase-title-morph'].filter(Boolean).join(' ')}
          disabled={chrome.reducedMotion}
          duration={220}
          ease="cubic-bezier(0.22, 1, 0.36, 1)"
          scale={false}
          style={titleProps.style}
        >
          {planet.name}
        </TextMorph>
        <a
          aria-label={`View ${planet.name} source on GitHub`}
          href={githubSourceUrl(planet.sourceFile)}
          onClick={() => track('clicked_github', { planet_id: planet.id, target: 'source' })}
          rel="noreferrer"
          target="_blank"
          {...stylex.props(styles.sourceLink, styles.eclipseTitleLighting)}
        >
          <GitHubMark />
        </a>
      </div>
      <AnimatePresence custom={chrome} initial={false} mode="popLayout">
        <motion.p
          key={planet.id}
          animate="center"
          custom={chrome}
          exit="exit"
          initial="enter"
          variants={chromeVariants}
          {...stylex.props(styles.summary, styles.eclipseTitleLighting)}
        >
          {planet.summary}
        </motion.p>
      </AnimatePresence>
    </>
  )
}

const styles = stylex.create({
  eclipseTitleLighting: {
    filter: 'var(--eclipse-introduction-filter)',
    textShadow: 'none',
    transition: 'filter 100ms cubic-bezier(0.23, 1, 0.32, 1)',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  summary: {
    color: 'var(--showcase-summary-ink)',
    fontSize: 13,
    lineHeight: 1.65,
    marginBottom: 0,
    marginTop: 8,
    maxWidth: 560,
    minHeight: 'calc(1.65em * 2)',
    transition: 'color 180ms ease-out',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  sourceIcon: {
    display: 'block',
    fill: 'currentColor',
    height: 16,
    width: 16,
  },
  sourceLink: {
    alignItems: 'center',
    color: 'var(--showcase-summary-ink)',
    display: 'inline-flex',
    flex: '0 0 auto',
    height: 40,
    justifyContent: 'center',
    touchAction: 'manipulation',
    transition: 'color 180ms ease-out',
    width: 40,
    ':focus-visible': {
      outline: '2px solid currentColor',
      outlineOffset: 2,
    },
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        color: 'var(--showcase-title-top)',
      },
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  title: {
    backgroundClip: 'text',
    backgroundImage:
      'linear-gradient(180deg, var(--showcase-title-top) 0%, var(--showcase-title-bottom) 100%)',
    color: 'transparent',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 'var(--showcase-title-size)',
    fontWeight: 590,
    letterSpacing: '-0.045em',
    lineHeight: 1.18,
    marginBottom: 0,
    marginInline: 0,
    marginTop: '-0.12em',
    minWidth: 0,
    overflow: 'visible',
    paddingBottom: '0.22em',
  },
  titleRow: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    minWidth: 0,
    overflow: 'visible',
    width: '100%',
  },
})
