'use client'

import * as stylex from '@stylexjs/stylex'
import { useRouter } from 'next/navigation'
import { Provider } from 'jotai'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { PlanetPage } from '../planet-page/planet-page'
import { planetPath } from '../planet-route/planet-route'
import { usePlanetId } from '../planet-route/use-planet-id'
import { usePlanetChromeStyle } from '../planets/chrome-lighting'
import { PlanetWheel, SettingsSheet } from './planet-wheel'
import { useMobileShowcase } from './use-mobile-showcase'
import { Inspector } from './inspector'
import { PlanetPicker } from './planet-picker'
import { chromeVariants, getPlanetTransitionPlan, planetPreviewVariants } from './planet-transition'
import type { ChromeTransitionContext } from './planet-transition'
import { ShowcaseContext } from './showcase-context'
import type { ShowcaseContextValue } from './showcase-context'
import { planets } from './showcase-data'
import type { PlanetId } from './showcase-data'

export function ShowcaseLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const selectedPlanet = usePlanetId()
  const queuedPlanetRef = useRef<PlanetId | null>(null)
  const [originPlanet, setOriginPlanet] = useState(selectedPlanet)
  const [showGrid, setShowGrid] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isMobile = useMobileShowcase()
  const reduceMotion = useReducedMotion()
  const lighting = usePlanetChromeStyle(selectedPlanet)
  const fromIndex = planets.findIndex(({ id }) => id === originPlanet)
  const toIndex = planets.findIndex(({ id }) => id === selectedPlanet)
  const transitionDirection: -1 | 1 = toIndex > fromIndex ? 1 : -1
  const plan = getPlanetTransitionPlan(originPlanet, selectedPlanet)
  const planet = planets.find(({ id }) => id === selectedPlanet) ?? planets[0]
  const chromeTransition: ChromeTransitionContext = {
    direction: transitionDirection,
    reducedMotion: Boolean(reduceMotion),
  }

  const selectPlanet = useCallback(
    (nextPlanet: PlanetId): void => {
      if (nextPlanet === originPlanet && nextPlanet === selectedPlanet) {
        queuedPlanetRef.current = null
        return
      }

      if (originPlanet !== selectedPlanet) {
        queuedPlanetRef.current = nextPlanet
        return
      }

      queuedPlanetRef.current = null
      router.push(planetPath(nextPlanet), { scroll: false })
    },
    [originPlanet, router, selectedPlanet],
  )

  const completePlanetTransition = useCallback((): void => {
    setOriginPlanet(selectedPlanet)
    const queuedPlanet = queuedPlanetRef.current
    queuedPlanetRef.current = null
    if (queuedPlanet && queuedPlanet !== selectedPlanet) {
      router.push(planetPath(queuedPlanet), { scroll: false })
    }
  }, [router, selectedPlanet])

  const showcaseContext = useMemo<ShowcaseContextValue>(
    () => ({
      planet,
      transitionDirection,
    }),
    [planet, transitionDirection],
  )

  return (
    <Provider>
      <ShowcaseContext.Provider value={showcaseContext}>
        <div {...stylex.props(styles.page)} style={lighting}>
          <PlanetPicker
            gridVisible={showGrid}
            onGridVisibleChange={setShowGrid}
            onSelectPlanet={selectPlanet}
            reducedMotion={Boolean(reduceMotion)}
            selectedPlanet={selectedPlanet}
          />

          <main {...stylex.props(styles.content)}>
            <PlanetPage>
              <PlanetPage.PreviewRegion>
                <PlanetPage.Introduction />
                <PlanetPage.Stage>
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
                      key={selectedPlanet}
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
                      {children}
                    </motion.div>
                  </AnimatePresence>
                </PlanetPage.Stage>
              </PlanetPage.PreviewRegion>
              <PlanetPage.Code />
              <PlanetPage.Textures />
            </PlanetPage>
          </main>

          {isMobile ? (
            <>
              <PlanetWheel
                onSelectPlanet={selectPlanet}
                onSettingsOpenChange={setSettingsOpen}
                reducedMotion={Boolean(reduceMotion)}
                selectedPlanet={selectedPlanet}
                settingsOpen={settingsOpen}
              />
              <SettingsSheet onOpenChange={setSettingsOpen} open={settingsOpen}>
                <Inspector planetId={selectedPlanet} />
              </SettingsSheet>
            </>
          ) : (
            <AnimatePresence custom={chromeTransition} initial={false}>
              <motion.aside
                key={selectedPlanet}
                animate="center"
                custom={chromeTransition}
                exit="exit"
                initial="enter"
                variants={chromeVariants}
                {...stylex.props(styles.inspector)}
              >
                <Inspector planetId={selectedPlanet} />
              </motion.aside>
            </AnimatePresence>
          )}

          {showGrid && <LayoutGridOverlay />}
        </div>
      </ShowcaseContext.Provider>
    </Provider>
  )
}

function LayoutGridOverlay() {
  return (
    <div {...stylex.props(styles.gridOverlay)} aria-hidden="true">
      <span {...stylex.props(styles.gridOverlayRail)} />
      <div {...stylex.props(styles.gridOverlayCenter)}>
        <div {...stylex.props(styles.gridOverlayContent)}>
          {Array.from({ length: 8 }, (_, index) => (
            <span
              key={index}
              {...stylex.props(
                styles.gridOverlayColumn,
                index >= 4 && styles.gridOverlayColumnMobileHidden,
              )}
            />
          ))}
        </div>
      </div>
      <span {...stylex.props(styles.gridOverlayRail)} />
    </div>
  )
}

const styles = stylex.create({
  content: {
    gridColumn: 2,
    minWidth: 0,
    paddingBlock: 0,
    paddingInline: 'clamp(24px, 4vw, 64px)',
    '@media (max-width: 960px)': {
      gridColumn: 'auto',
    },
  },
  gridOverlay: {
    backgroundImage:
      'repeating-linear-gradient(to bottom, transparent 0, transparent 7px, color-mix(in oklch, var(--control-accent) 3%, transparent) 7px, color-mix(in oklch, var(--control-accent) 3%, transparent) 8px), repeating-linear-gradient(to bottom, transparent 0, transparent 63px, color-mix(in oklch, var(--control-accent) 7%, transparent) 63px, color-mix(in oklch, var(--control-accent) 7%, transparent) 64px)',
    display: 'grid',
    gridTemplateColumns: '300px minmax(400px, 1fr) 280px',
    inset: 0,
    pointerEvents: 'none',
    position: 'fixed',
    zIndex: 100,
    '@media (max-width: 1080px)': {
      gridTemplateColumns: '260px minmax(320px, 1fr) 280px',
    },
    '@media (max-width: 960px)': {
      display: 'block',
    },
  },
  gridOverlayCenter: {
    backgroundColor: 'color-mix(in oklch, var(--control-accent) 2%, transparent)',
    height: '100%',
    minWidth: 0,
    paddingInline: 'clamp(24px, 4vw, 64px)',
  },
  gridOverlayColumn: {
    backgroundColor: 'color-mix(in oklch, var(--control-accent) 5%, transparent)',
  },
  gridOverlayColumnMobileHidden: {
    '@media (max-width: 960px)': {
      display: 'none',
    },
  },
  gridOverlayContent: {
    columnGap: 24,
    display: 'grid',
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    height: '100%',
    marginInline: 'auto',
    maxWidth: 820,
    '@media (max-width: 1279px)': {
      columnGap: 16,
    },
    '@media (max-width: 960px)': {
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    },
  },
  gridOverlayRail: {
    backgroundColor: 'color-mix(in oklch, var(--control-accent) 4%, transparent)',
    '@media (max-width: 960px)': {
      display: 'none',
    },
  },
  inspector: {
    backgroundColor: 'transparent',
    height: '100dvh',
    minWidth: 0,
    overflowY: 'auto',
    paddingBottom: 12,
    paddingInlineEnd: 20,
    paddingInlineStart: 12,
    paddingTop: 'calc(var(--showcase-preview-top) - (36px - 13px) / 2)',
    position: 'fixed',
    right: 0,
    top: 0,
    width: 280,
    willChange: 'opacity, transform',
    zIndex: 2,
    '@media (max-width: 960px)': {
      display: 'none',
    },
  },
  page: {
    '--showcase-badge-ink': 'rgba(242, 232, 208, 0.5)',
    '--showcase-inspector-width': '280px',
    '--showcase-nav-ink': 'rgba(242, 232, 208, 0.42)',
    '--showcase-nav-ink-hover': 'rgba(242, 232, 208, 0.76)',
    '--showcase-nav-ink-strong': '#f2e8d0',
    '--showcase-picker-width': '300px',
    '--showcase-preview-top': 'round(calc(70px + clamp(24px, 4vh, 52px)), 8px)',
    '--showcase-summary-ink': 'rgba(242, 232, 208, 0.42)',
    '--showcase-title-bottom': 'color(display-p3 0.8787 0.8708 0.8589)',
    '--showcase-title-size': 'clamp(36px, 4vw, 52px)',
    '--showcase-title-top': 'color(display-p3 1 1 1)',
    backgroundColor: '#07080d',
    display: 'grid',
    gridTemplateColumns: '300px minmax(400px, 1fr) 280px',
    minHeight: '100dvh',
    overflow: 'clip',
    '@media (min-width: 961px) and (max-width: 1080px)': {
      '--showcase-picker-width': '260px',
      gridTemplateColumns: '260px minmax(320px, 1fr) 280px',
    },
    '@media (max-width: 960px)': {
      '--showcase-inspector-width': '0px',
      '--showcase-picker-width': '0px',
      '--showcase-preview-top': '0px',
      display: 'block',
      overflow: 'hidden',
    },
  },
  planetTravelLayer: {
    inset: 0,
    position: 'absolute',
    transformOrigin: 'center',
    willChange: 'opacity, transform',
  },
})
