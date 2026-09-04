import * as stylex from '@stylexjs/stylex'
import { Earth } from '@thecuvii/solaris/earth'
import { Jupiter } from '@thecuvii/solaris/jupiter'
import { Mars } from '@thecuvii/solaris/mars'
import { Mercury } from '@thecuvii/solaris/mercury'
import { LunarEclipse, Moon } from '@thecuvii/solaris/moon'
import { Neptune } from '@thecuvii/solaris/neptune'
import { ObservedSun } from '@thecuvii/solaris/observed-sun'
import { Pluto } from '@thecuvii/solaris/pluto'
import { Saturn } from '@thecuvii/solaris/saturn'
import { Sun } from '@thecuvii/solaris/sun'
import { Titan } from '@thecuvii/solaris/titan'
import { Uranus } from '@thecuvii/solaris/uranus'
import { Venus } from '@thecuvii/solaris/venus'
import { useAtomValue } from 'jotai'
import { AnimatePresence, motion } from 'motion/react'
import { TextMorph } from 'torph/react'

import { chromeVariants } from './planet-transition'
import type { ChromeTransitionContext } from './planet-transition'
import type { Planet, PlanetId } from './showcase-data'
import { textures } from './showcase-data'
import type { PlanetSettings } from './showcase-params'
import { planetSettingsAtom } from './showcase-settings'

const earthModel = {
  mieExtinction: [8, 8, 8],
  mieScattering: [5.4, 5.1, 4.8],
  ozoneAbsorption: [0.65, 1.88, 0.08],
  rayleighScattering: [3.2, 7.6, 18.5],
  space: [0, 0, 0.002],
  surfaceDay: [0.035, 0.22, 0.3],
  surfaceNight: [0.002, 0.006, 0.018],
  sun: [1, 0.91, 0.72],
  sunIntensity: 18,
} as const

export function PlanetPreviewWithSettings({ id }: { id: PlanetId }) {
  const settings = useAtomValue(planetSettingsAtom(id))
  return <PlanetPreview id={id} settings={settings} />
}

function PlanetPreview({ id, settings }: { id: PlanetId; settings: PlanetSettings }) {
  const shared = {
    ...settings,
    style: { height: '100%', position: 'relative' as const, width: '100%' },
  }

  switch (id) {
    case 'earth':
      return (
        <Earth
          {...shared}
          composition={{
            bottom: 'calc((clamp(480px, 68vh, 720px) - clamp(360px, 52vh, 590px)) / 2)',
            height: 'clamp(360px, 52vh, 590px)',
            width: 'calc(100% - 2 * clamp(24px, 4vw, 64px))',
          }}
          model={earthModel}
          textures={textures.earth}
          viewport={{
            bottom: 0,
            left: 'clamp(24px, 4vw, 64px)',
            right: 'clamp(24px, 4vw, 64px)',
            top: 0,
          }}
        />
      )
    case 'jupiter':
      return <Jupiter {...shared} textures={textures.jupiter} />
    case 'lunar-eclipse':
      return (
        <LunarEclipse
          {...shared}
          composition={{
            bottom: 'calc((clamp(480px, 68vh, 720px) - clamp(360px, 52vh, 590px)) / 2)',
            height: 'clamp(360px, 52vh, 590px)',
            width: 'calc(100% - 2 * clamp(24px, 4vw, 64px))',
          }}
          textures={textures['lunar-eclipse']}
          viewport={{
            bottom: 0,
            left: 'calc(50% - 50vw - (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
            right:
              'calc(50% - 50vw + (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
            top: 'calc(var(--showcase-preview-top) * -1)',
          }}
        />
      )
    case 'mars':
      return <Mars {...shared} textures={textures.mars} />
    case 'mercury':
      return <Mercury {...shared} textures={textures.mercury} />
    case 'moon':
      return (
        <Moon
          {...shared}
          composition={{
            bottom: 'calc((clamp(480px, 68vh, 720px) - clamp(360px, 52vh, 590px)) / 2)',
            height: 'clamp(360px, 52vh, 590px)',
            width: 'calc(100% - 2 * clamp(24px, 4vw, 64px))',
          }}
          textures={textures.moon}
          viewport={{
            bottom: 'calc(var(--showcase-preview-top) + 100% - 100vh)',
            left: 'calc(50% - 50vw - (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
            right:
              'calc(50% - 50vw + (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
            top: 'calc(var(--showcase-preview-top) * -1)',
          }}
        />
      )
    case 'neptune':
      return <Neptune {...shared} />
    case 'observed-sun':
      return (
        <ObservedSun
          {...shared}
          composition={{
            bottom: 'calc((clamp(480px, 68vh, 720px) - clamp(360px, 52vh, 590px)) / 2)',
            height: 'clamp(360px, 52vh, 590px)',
            width: 'calc(100% - 2 * clamp(24px, 4vw, 64px))',
          }}
          viewport={{
            bottom: 0,
            left: 'calc(50% - 50vw - (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
            right:
              'calc(50% - 50vw + (var(--showcase-picker-width) - var(--showcase-inspector-width)) / 2)',
            top: 'calc(var(--showcase-preview-top) * -1)',
          }}
        />
      )
    case 'pluto':
      return <Pluto {...shared} textures={textures.pluto} />
    case 'saturn':
      return <Saturn {...shared} textures={textures.saturn} />
    case 'sun':
      return <Sun {...shared} textures={textures.sun} />
    case 'titan':
      return <Titan {...shared} />
    case 'uranus':
      return <Uranus {...shared} />
    case 'venus':
      return <Venus {...shared} textures={textures.venus} />
  }
}

export function PlanetIntroduction({
  chrome,
  planet,
}: {
  chrome: ChromeTransitionContext
  planet: Planet
}) {
  const componentName = planet.componentName ?? planet.name
  const badgeProps = stylex.props(styles.componentName)

  return (
    <>
      <div {...stylex.props(styles.titleRow)}>
        <h1 {...stylex.props(styles.title, styles.eclipseTitleLighting)}>{planet.name}</h1>
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
