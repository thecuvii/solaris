import { PreviewCard } from '@base-ui/react/preview-card'
import * as stylex from '@stylexjs/stylex'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { memo } from 'react'

import { defaultPlanetId, planetPath } from '../planet-route/planet-route'
import { ParameterSwitch } from './inspector'
import { planets, withSiteSource } from './showcase-data'
import type { PlanetId } from './showcase-data'
import { track } from './track'

const seeAlso = [
  { credit: 'Shu Ding', href: 'https://cobe.vercel.app/', title: 'Cobe' },
  { credit: 'Javier Crocco', href: 'https://www.tryspherium.com/', title: 'Spherium' },
  { credit: 'Dmytro Kondakov', href: 'https://gps-01.dmytro.fyi/', title: 'GPS 01' },
  {
    credit: 'Maxime Heckel',
    href: 'https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/',
    title: 'Blog series',
  },
] as const

function ShowcaseWordmark({ sidebar = false }: { sidebar?: boolean }) {
  return (
    <Link
      data-sky-ink={sidebar ? '' : undefined}
      href={planetPath(defaultPlanetId)}
      {...stylex.props(
        styles.wordmark,
        styles.eclipseNavigationLighting,
        sidebar && styles.pickerWordmark,
      )}
    >
      <span {...stylex.props(styles.wordmarkMark)} aria-hidden="true" />
      Solaris
    </Link>
  )
}

export const PlanetPicker = memo(function PlanetPicker({
  gridVisible,
  onGridVisibleChange,
  reducedMotion,
  selectedPlanet,
}: {
  gridVisible: boolean
  onGridVisibleChange: (visible: boolean) => void
  reducedMotion: boolean
  selectedPlanet: PlanetId
}) {
  return (
    <>
      <header {...stylex.props(styles.mobileHeader)}>
        <ShowcaseWordmark />
      </header>
      <aside {...stylex.props(styles.picker)} aria-label="Celestial objects">
        <div data-chrome-probe="nav" {...stylex.props(styles.pickerNavigation)}>
          <ShowcaseWordmark sidebar />

          <nav {...stylex.props(styles.planetList)}>
            {planets.map((planet) => (
              <Link
                key={planet.id}
                data-sky-ink=""
                href={planetPath(planet.id)}
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

          <div data-sky-ink="" {...stylex.props(styles.pickerMeta)}>
            <a
              href={withSiteSource('https://github.com/thecuvii/solaris')}
              onClick={() => track('clicked_github', { target: 'repo' })}
              {...stylex.props(styles.pickerMetaLink)}
            >
              GitHub
            </a>
            <div>
              Made by{' '}
              <a
                href="https://x.com/thecuvii"
                onClick={() => track('clicked_cuvii')}
                {...stylex.props(styles.pickerMetaLink)}
              >
                Cuvii
              </a>
            </div>
            <SeeAlsoLinks />
          </div>
        </div>
      </aside>
      {process.env.NODE_ENV === 'development' ? (
        <div {...stylex.props(styles.gridDock)}>
          <ParameterSwitch
            checked={gridVisible}
            compact
            label="Grid"
            onCheckedChange={onGridVisibleChange}
          />
        </div>
      ) : null}
    </>
  )
})

function SeeAlsoLinks() {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        closeDelay={150}
        delay={200}
        render={<button type="button" />}
        {...stylex.props(styles.seeAlsoTrigger)}
      >
        More resources
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          align="center"
          side="top"
          sideOffset={8}
          {...stylex.props(styles.seeAlsoPositioner)}
        >
          <PreviewCard.Popup {...stylex.props(styles.seeAlsoPopup)}>
            {seeAlso.map((resource) => (
              <a
                href={resource.href}
                key={resource.href}
                onClick={() =>
                  track('clicked_resource', { href: resource.href, title: resource.title })
                }
                rel="noreferrer"
                target="_blank"
                {...stylex.props(styles.seeAlsoLink)}
              >
                <span {...stylex.props(styles.seeAlsoTitle)}>{resource.title}</span>
                <span {...stylex.props(styles.seeAlsoCredit)}>by {resource.credit}</span>
              </a>
            ))}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}

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
    '@media (max-width: 960px)': {
      left: 'auto',
      right: 'clamp(24px, 4vw, 64px)',
      top: 'calc(12px + env(safe-area-inset-top, 0px))',
    },
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
      order: 1,
      overflow: 'visible',
      position: 'relative',
      top: 'auto',
      width: 'auto',
      zIndex: 'auto',
    },
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
      alignSelf: 'flex-end',
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      marginTop: 0,
      minWidth: 0,
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
  seeAlsoCredit: {
    color: 'rgba(242, 232, 208, 0.42)',
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.3,
  },
  seeAlsoLink: {
    alignItems: 'baseline',
    color: 'inherit',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.35em',
    minWidth: 0,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    ':focus-visible': {
      outline: 'none',
    },
    ':focus-visible > span:first-child': {
      color: '#f2e8d0',
    },
    '@media (hover: hover) and (pointer: fine)': {
      ':hover > span:first-child': {
        color: '#f2e8d0',
      },
    },
  },
  seeAlsoPopup: {
    backgroundColor: '#12151c',
    borderRadius: 12,
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 16px 40px rgba(0, 0, 0, 0.32)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'var(--font-sans)',
    gap: 10,
    padding: 14,
    transformOrigin: 'var(--transform-origin)',
    transition: 'opacity 160ms ease-out, transform 160ms ease-out',
    width: 'max-content',
    ':is([data-starting-style], [data-ending-style])': {
      opacity: 0,
      transform: 'scale(0.96)',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  seeAlsoPositioner: {
    zIndex: 200,
  },
  seeAlsoTitle: {
    color: 'rgba(242, 232, 208, 0.82)',
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.3,
  },
  seeAlsoTrigger: {
    appearance: 'none',
    alignSelf: 'flex-end',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: {
      default: 'var(--showcase-nav-ink-hover)',
      ':hover': 'var(--showcase-nav-ink-strong)',
      ':focus-visible': 'var(--showcase-nav-ink-strong)',
    },
    cursor: 'pointer',
    font: 'inherit',
    margin: 0,
    padding: 0,
    textDecorationLine: {
      default: 'underline',
      ':hover': 'underline',
      ':focus-visible': 'underline',
    },
    textDecorationThickness: 1,
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': {
      outline: 'none',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
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
      alignItems: 'flex-start',
      bottom: 'auto',
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingBottom: 'calc(var(--showcase-stage-nudge) + env(safe-area-inset-bottom, 0px))',
      paddingInline: 'clamp(24px, 4vw, 64px)',
      paddingTop: 20,
      position: 'relative',
      right: 'auto',
      top: 'auto',
      width: '100%',
    },
  },
  mobileHeader: {
    display: 'none',
    '@media (max-width: 960px)': {
      backgroundColor: 'transparent',
      display: 'flex',
      flex: '0 0 auto',
      paddingBottom: 0,
      paddingInline: 'clamp(24px, 4vw, 64px)',
      paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
      position: 'relative',
    },
  },
  pickerWordmark: {
    alignSelf: 'flex-end',
    flex: '0 0 auto',
    marginRight: 26,
    '@media (max-width: 960px)': {
      display: 'none',
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
