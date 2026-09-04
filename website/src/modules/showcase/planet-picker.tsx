import * as stylex from '@stylexjs/stylex'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { memo, useState } from 'react'

import { ParameterSwitch } from './inspector'
import { planets } from './showcase-data'
import type { PlanetId } from './showcase-data'

const alsoArrowTransition = {
  duration: 0.22,
  ease: [0.4, 0, 0.2, 1],
} as const

function SeeAlsoLink({ children, href }: { children: ReactNode; href: string }) {
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState(false)
  const drawn = active ? 1 : 0
  const transition = reduceMotion ? { duration: 0 } : alsoArrowTransition

  return (
    <a
      href={href}
      onBlur={() => setActive(false)}
      onFocus={() => setActive(true)}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      rel="noreferrer"
      target="_blank"
      {...stylex.props(styles.pickerMetaLink, styles.pickerAlsoLink)}
    >
      {children}
      <svg aria-hidden="true" viewBox="0 0 18 18" {...stylex.props(styles.pickerAlsoArrow)}>
        <g
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.25}
        >
          <motion.path
            animate={{ opacity: drawn, pathLength: drawn }}
            d="M3.75 14.25 14.25 3.75"
            initial={false}
            transition={transition}
          />
          <motion.path
            animate={{ opacity: drawn, pathLength: drawn }}
            d="M8.24 3.75 14.25 3.75"
            initial={false}
            transition={transition}
          />
          <motion.path
            animate={{ opacity: drawn, pathLength: drawn }}
            d="M14.25 9.76 14.25 3.75"
            initial={false}
            transition={transition}
          />
        </g>
      </svg>
    </a>
  )
}

export const PlanetPicker = memo(function PlanetPicker({
  gridVisible,
  onGridVisibleChange,
  onSelectPlanet,
  reducedMotion,
  selectedPlanet,
}: {
  gridVisible: boolean
  onGridVisibleChange: (visible: boolean) => void
  onSelectPlanet: (planet: PlanetId) => void
  reducedMotion: boolean
  selectedPlanet: PlanetId
}) {
  function selectPlanetFromLink(event: ReactMouseEvent<HTMLAnchorElement>, planet: PlanetId) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return
    }
    event.preventDefault()
    onSelectPlanet(planet)
  }

  return (
    <>
      <aside {...stylex.props(styles.picker)} aria-label="Celestial objects">
        <div {...stylex.props(styles.pickerNavigation)}>
          <Link
            onClick={(event) => selectPlanetFromLink(event, 'earth')}
            params={{ planet: 'earth' }}
            preload="intent"
            to="/$planet"
            {...stylex.props(
              styles.wordmark,
              styles.pickerWordmark,
              styles.eclipseNavigationLighting,
            )}
          >
            <span {...stylex.props(styles.wordmarkMark)} aria-hidden="true" />
            Solaris
          </Link>

          <nav {...stylex.props(styles.planetList)}>
            {planets.map((planet) => (
              <Link
                key={planet.id}
                onClick={(event) => selectPlanetFromLink(event, planet.id)}
                params={{ planet: planet.id }}
                preload="intent"
                preloadDelay={40}
                to="/$planet"
                {...stylex.props(
                  styles.planetTab,
                  selectedPlanet === planet.id && styles.planetTabSelected,
                )}
              >
                <span {...stylex.props(styles.planetTabLabel)}>
                  <AnimatePresence initial={false}>
                    {selectedPlanet === planet.id && (
                      <motion.span
                        key="active-indicator"
                        animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
                        aria-hidden="true"
                        exit={{
                          opacity: 0,
                          transform: reducedMotion
                            ? 'translate3d(0, 0, 0)'
                            : 'translate3d(-6px, 0, 0)',
                        }}
                        initial={{
                          opacity: 0,
                          transform: reducedMotion
                            ? 'translate3d(0, 0, 0)'
                            : 'translate3d(-6px, 0, 0)',
                        }}
                        transition={{
                          duration: reducedMotion ? 0.14 : 0.3,
                          ease: reducedMotion ? 'linear' : [0.4, 0, 0.2, 1],
                        }}
                        {...stylex.props(styles.planetTabIndicator)}
                      />
                    )}
                  </AnimatePresence>
                  <span {...stylex.props(styles.eclipseNavigationLighting)}>{planet.name}</span>
                </span>
                <span {...stylex.props(styles.planetThumbnail)} aria-hidden="true">
                  <img
                    alt=""
                    draggable={false}
                    height={160}
                    src={`/thumbnails/v1/${planet.id}.avif`}
                    width={160}
                    {...stylex.props(styles.planetThumbnailImage)}
                    style={planet.id === 'saturn' ? { transform: 'scale(1.2)' } : undefined}
                  />
                </span>
              </Link>
            ))}
          </nav>

          <div {...stylex.props(styles.pickerAlso, styles.eclipseNavigationLighting)}>
            <div {...stylex.props(styles.pickerAlsoLabel)}>See also</div>
            <div {...stylex.props(styles.pickerAlsoItem)}>
              <SeeAlsoLink href="https://cobe.vercel.app/">Cobe</SeeAlsoLink>
              <span {...stylex.props(styles.pickerAlsoAuthor)}>Shu Ding</span>
            </div>
            <div {...stylex.props(styles.pickerAlsoItem)}>
              <SeeAlsoLink href="https://www.tryspherium.com/">Spherium</SeeAlsoLink>
              <span {...stylex.props(styles.pickerAlsoAuthor)}>Javier Crocco</span>
            </div>
          </div>

          <div {...stylex.props(styles.pickerMeta, styles.eclipseNavigationLighting)}>
            <a href="https://github.com/thecuvii/solaris" {...stylex.props(styles.pickerMetaLink)}>
              GitHub
            </a>
            <div>
              Made by{' '}
              <a href="https://github.com/thecuvii" {...stylex.props(styles.pickerMetaLink)}>
                Cuvii
              </a>
            </div>
          </div>
        </div>
      </aside>
      <div {...stylex.props(styles.gridDock)}>
        <ParameterSwitch
          checked={gridVisible}
          compact
          label="Grid"
          onCheckedChange={onGridVisibleChange}
        />
      </div>
    </>
  )
})

const styles = stylex.create({
  eclipseNavigationLighting: {
    filter: 'var(--eclipse-navigation-filter)',
    transition: 'filter 100ms cubic-bezier(0.23, 1, 0.32, 1)',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  gridDock: {
    left: 16,
    position: 'fixed',
    top: 16,
    width: 'max-content',
    zIndex: 3,
  },
  picker: {
    height: '100dvh',
    left: 0,
    minHeight: '100dvh',
    overflow: 'visible',
    position: 'fixed',
    top: 0,
    width: 300,
    zIndex: 2,
    '@media (max-width: 1080px)': {
      width: 260,
    },
    '@media (max-width: 960px)': {
      height: 'auto',
      left: 'auto',
      minHeight: 0,
      overflow: 'hidden',
      position: 'relative',
      top: 'auto',
      width: 'auto',
      zIndex: 'auto',
    },
  },
  pickerAlso: {
    alignSelf: 'flex-end',
    display: 'flex',
    flex: '0 0 auto',
    flexDirection: 'column',
    fontSize: 11,
    gap: 10,
    marginRight: 29,
    marginTop: 12,
    paddingRight: 14,
    paddingTop: 12,
    textAlign: 'right',
    width: 180,
    '@media (max-width: 960px)': {
      marginLeft: 16,
      marginRight: 16,
      width: 'auto',
    },
  },
  pickerAlsoArrow: {
    display: 'block',
    height: 11,
    left: 'calc(100% + 3px)',
    overflow: 'visible',
    pointerEvents: 'none',
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 11,
  },
  pickerAlsoAuthor: {
    color: 'var(--showcase-nav-ink)',
    fontSize: 10,
    lineHeight: 1.35,
  },
  pickerAlsoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  pickerAlsoLabel: {
    color: 'var(--showcase-nav-ink)',
    fontSize: 10,
    lineHeight: 1.45,
  },
  pickerAlsoLink: {
    alignSelf: 'flex-end',
    color: {
      default: 'var(--showcase-nav-ink-hover)',
      ':hover': 'var(--showcase-nav-ink-strong)',
      ':focus-visible': 'var(--showcase-nav-ink-strong)',
    },
    position: 'relative',
  },
  pickerMeta: {
    alignSelf: 'flex-end',
    color: 'var(--showcase-nav-ink)',
    display: 'flex',
    flex: '0 0 auto',
    flexDirection: 'column',
    fontSize: 10,
    gap: 5,
    lineHeight: 1.45,
    marginRight: 29,
    marginTop: 'auto',
    textAlign: 'right',
    width: 180,
    '@media (max-width: 960px)': {
      marginBottom: 20,
      marginLeft: 16,
      marginRight: 16,
      width: 'auto',
    },
  },
  pickerMetaLink: {
    color: {
      default: 'var(--showcase-nav-ink-hover)',
      ':hover': 'var(--showcase-nav-ink-strong)',
      ':focus-visible': 'var(--showcase-nav-ink-strong)',
    },
    textDecorationLine: 'underline',
    textDecorationThickness: 1,
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': {
      outline: 'none',
    },
  },
  pickerNavigation: {
    bottom: 16,
    display: 'flex',
    flexDirection: 'column',
    position: 'absolute',
    right: 0,
    top: 'var(--showcase-preview-top)',
    width: 204,
    '@media (max-width: 960px)': {
      bottom: 'auto',
      position: 'relative',
      right: 'auto',
      top: 'auto',
      width: '100%',
    },
  },
  pickerWordmark: {
    alignSelf: 'flex-end',
    flex: '0 0 auto',
    marginRight: 26,
    '@media (max-width: 960px)': {
      alignSelf: 'flex-start',
      marginLeft: 16,
      marginRight: 0,
      marginTop: 20,
      transform: 'none',
    },
  },
  planetList: {
    display: 'flex',
    flexShrink: 1,
    flexDirection: 'column',
    gap: 2,
    marginTop: 'calc(var(--showcase-title-size) * 1.1 + 1.5px + 8px - 17px)',
    minHeight: 0,
    overflowY: 'auto',
    paddingRight: 24,
    scrollbarWidth: 'none',
    width: 204,
    '@media (max-width: 960px)': {
      display: 'none',
    },
  },
  planetTab: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: {
      default: 'var(--showcase-nav-ink)',
      ':hover': 'var(--showcase-nav-ink-hover)',
      ':focus-visible': 'var(--showcase-nav-ink-strong)',
    },
    cursor: 'pointer',
    display: 'grid',
    fontSize: 11,
    gap: 12,
    gridTemplateColumns: 'minmax(0, 1fr) 28px',
    lineHeight: 1.2,
    minHeight: 36,
    padding: 0,
    position: 'relative',
    scrollSnapAlign: 'center',
    textAlign: 'right',
    textDecoration: 'none',
    transition: 'color 140ms ease-out',
    whiteSpace: 'nowrap',
    width: 180,
    ':focus-visible': { outline: 'none' },
    '@media (max-width: 960px)': {
      display: 'flex',
      flex: '0 0 auto',
      flexDirection: 'column-reverse',
      fontSize: 9,
      gap: 3,
      minHeight: 60,
      padding: 4,
      textAlign: 'center',
      width: 68,
    },
  },
  planetTabIndicator: {
    backgroundColor: 'var(--showcase-nav-ink-strong)',
    borderRadius: '50%',
    height: 4,
    position: 'absolute',
    right: 'calc(100% + 6px)',
    top: 'calc(50% - 2px)',
    width: 4,
  },
  planetTabLabel: {
    justifySelf: 'end',
    position: 'relative',
  },
  planetTabSelected: {
    color: 'var(--showcase-nav-ink-strong)',
  },
  planetThumbnail: {
    flex: '0 0 auto',
    height: 28,
    overflow: 'visible',
    pointerEvents: 'none',
    position: 'relative',
    width: 28,
    '@media (max-width: 960px)': {
      height: 34,
      width: 34,
    },
  },
  planetThumbnailImage: {
    display: 'block',
    height: '100%',
    inset: 0,
    objectFit: 'contain',
    position: 'absolute',
    width: '100%',
  },
  wordmark: {
    alignItems: 'center',
    color: 'var(--showcase-nav-ink-strong)',
    display: 'flex',
    fontSize: 13,
    fontWeight: 620,
    gap: 9,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    textDecoration: 'none',
    ':focus-visible': {
      boxShadow: '0 2px 0 rgba(242,232,208,0.62)',
      color: 'var(--showcase-nav-ink-strong)',
      outline: 'none',
    },
  },
  wordmarkMark: {
    backgroundColor: 'var(--showcase-nav-ink-strong)',
    borderRadius: '50%',
    boxShadow: 'inset -3px -2px 0 rgba(16,17,18,0.52)',
    height: 11,
    width: 11,
  },
})
