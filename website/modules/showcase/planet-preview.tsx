import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, motion } from 'motion/react'
import { TextMorph } from 'torph/react'

import { chromeVariants } from './planet-transition'
import type { ChromeTransitionContext } from './planet-transition'
import type { Planet } from './showcase-data'

export function PlanetIntroduction({
  chrome,
  planet,
}: {
  chrome: ChromeTransitionContext
  planet: Planet
}) {
  const componentName = planet.componentName ?? planet.name
  const titleProps = stylex.props(styles.title, styles.eclipseTitleLighting)
  const badgeProps = stylex.props(styles.componentName)

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
        <TextMorph
          as="span"
          className={badgeProps.className}
          disabled={chrome.reducedMotion}
          duration={220}
          ease="cubic-bezier(0.22, 1, 0.36, 1)"
          scale={false}
          style={badgeProps.style}
        >
          {`<${componentName} />`}
        </TextMorph>
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
  componentName: {
    backgroundColor: 'rgba(242, 232, 208, 0.065)',
    borderRadius: 999,
    color: 'var(--showcase-badge-ink)',
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: 10,
    paddingBlock: 6,
    paddingInline: 10,
    transform: 'translateY(-8px)',
  },
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
  title: {
    backgroundClip: 'text',
    backgroundImage:
      'linear-gradient(180deg, var(--showcase-title-top) 0%, var(--showcase-title-bottom) 100%)',
    color: 'transparent',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 'var(--showcase-title-size)',
    fontWeight: 590,
    letterSpacing: '-0.045em',
    lineHeight: 1,
    marginBottom: 0,
    marginInline: 0,
    marginTop: '-0.12em',
    overflow: 'visible',
    paddingBottom: '0.22em',
  },
  titleRow: {
    alignItems: 'baseline',
    display: 'flex',
    gap: 13,
  },
})
