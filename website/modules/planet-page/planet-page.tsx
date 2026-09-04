'use client'

import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'

import { useReducedMotion } from 'motion/react'

import { CodeBlock } from '../showcase/example-code'
import { PlanetIntroduction } from '../showcase/planet-preview'
import { preloadPlanetTextures } from '../showcase/showcase-data'
import { useShowcase } from '../showcase/showcase-context'
import { TextureDocs } from '../showcase/texture-docs'

function PlanetPageRoot({ children }: { children: ReactNode }) {
  const { planet } = useShowcase()
  preloadPlanetTextures(planet.id)
  return <div {...stylex.props(styles.panel)}>{children}</div>
}

function PreviewRegion({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.previewRegion)}>{children}</div>
}

function Introduction() {
  const { planet, transitionDirection } = useShowcase()
  const reduceMotion = useReducedMotion()
  return (
    <div {...stylex.props(styles.introduction, styles.eclipseIntroductionLighting)}>
      <PlanetIntroduction
        chrome={{
          direction: transitionDirection,
          reducedMotion: Boolean(reduceMotion),
        }}
        planet={planet}
      />
    </div>
  )
}

function Stage({ children }: { children: ReactNode }) {
  return (
    <>
      <div {...stylex.props(styles.previewStageSpace)} />
      <div {...stylex.props(styles.stage)}>{children}</div>
    </>
  )
}

function Code() {
  const { planet } = useShowcase()
  return <CodeBlock planet={planet} />
}

function Textures() {
  const { planet } = useShowcase()
  return <TextureDocs planetId={planet.id} />
}

export const PlanetPage = Object.assign(PlanetPageRoot, {
  Code,
  Introduction,
  PreviewRegion,
  Stage,
  Textures,
})

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
})
