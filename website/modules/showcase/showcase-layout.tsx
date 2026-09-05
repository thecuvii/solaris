'use client'

import * as stylex from '@stylexjs/stylex'
import { useRouter } from 'next/navigation'
import { Provider } from 'jotai'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import { PlanetPage } from '../planet-page/planet-page'
import { PlanetStage } from '../planet-page/planet-stage'
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
  return (
    <Provider>
      <ShowcaseShell>{children}</ShowcaseShell>
    </Provider>
  )
}

function ShowcaseShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const selectedPlanet = usePlanetId()
  const queuedPlanetRef = useRef<PlanetId | null>(null)
  const selectedPlanetRef = useRef(selectedPlanet)
  const transitionInFlightRef = useRef(false)
  const [previewPlanet, setPreviewPlanet] = useState(selectedPlanet)
  const [presentedPlanet, setPresentedPlanet] = useState(selectedPlanet)
  const [transitionDirection, setTransitionDirection] = useState<-1 | 1>(1)
  const [plan, setPlan] = useState(() => getPlanetTransitionPlan(selectedPlanet, selectedPlanet))
  const [showGrid, setShowGrid] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isMobile = useMobileShowcase()
  const reduceMotion = useReducedMotion()
  const lighting = usePlanetChromeStyle(previewPlanet)
  const planet = planets.find(({ id }) => id === presentedPlanet) ?? planets[0]
  const chromeTransition: ChromeTransitionContext = {
    direction: transitionDirection,
    reducedMotion: Boolean(reduceMotion),
  }

  const startPlanetTransition = useCallback(
    (nextPlanet: PlanetId, updateRoute = true): void => {
      const currentPlanet = selectedPlanetRef.current
      if (nextPlanet === currentPlanet) return

      const currentIndex = planets.findIndex(({ id }) => id === currentPlanet)
      const nextIndex = planets.findIndex(({ id }) => id === nextPlanet)
      transitionInFlightRef.current = true
      selectedPlanetRef.current = nextPlanet
      setPreviewPlanet(nextPlanet)
      setPresentedPlanet(nextPlanet)
      setTransitionDirection(nextIndex > currentIndex ? 1 : -1)
      setPlan(getPlanetTransitionPlan(currentPlanet, nextPlanet))
      if (updateRoute) {
        router.push(planetPath(nextPlanet))
      }
    },
    [router],
  )

  const selectPlanet = useCallback(
    (nextPlanet: PlanetId): void => {
      if (nextPlanet === selectedPlanetRef.current) {
        queuedPlanetRef.current = null
        if (nextPlanet !== selectedPlanet) {
          router.push(planetPath(nextPlanet))
        }
        return
      }

      if (transitionInFlightRef.current) {
        queuedPlanetRef.current = nextPlanet
        return
      }

      startPlanetTransition(nextPlanet)
    },
    [router, selectedPlanet, startPlanetTransition],
  )

  const completePlanetTransition = useCallback((): void => {
    setPresentedPlanet(selectedPlanetRef.current)
    transitionInFlightRef.current = false
    const queuedPlanet = queuedPlanetRef.current
    queuedPlanetRef.current = null
    if (queuedPlanet) startPlanetTransition(queuedPlanet, queuedPlanet !== selectedPlanet)
  }, [selectedPlanet, startPlanetTransition])

  const syncRoutePlanet = useEffectEvent((nextPlanet: PlanetId) => {
    const previousPlanet = selectedPlanetRef.current
    if (previousPlanet === nextPlanet) return

    if (transitionInFlightRef.current) {
      queuedPlanetRef.current = nextPlanet
      return
    }

    startPlanetTransition(nextPlanet, false)
  })

  useEffect(() => {
    syncRoutePlanet(selectedPlanet)
  }, [selectedPlanet])

  const showcaseContext = useMemo<ShowcaseContextValue>(
    () => ({
      planet,
      transitionDirection,
    }),
    [planet, transitionDirection],
  )

  return (
    <ShowcaseContext.Provider value={showcaseContext}>
      <div {...stylex.props(styles.page)} style={lighting}>
        <PlanetPicker
          gridVisible={showGrid}
          onGridVisibleChange={setShowGrid}
          reducedMotion={Boolean(reduceMotion)}
          selectedPlanet={previewPlanet}
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
                    <PlanetStage planetId={previewPlanet} />
                  </motion.div>
                </AnimatePresence>
              </PlanetPage.Stage>
            </PlanetPage.PreviewRegion>
            <PlanetPage.Code />
            <PlanetPage.Textures />
          </PlanetPage>
          <div hidden>{children}</div>
        </main>

        {isMobile ? (
          <>
            <PlanetWheel
              onSelectPlanet={selectPlanet}
              onSettingsOpenChange={setSettingsOpen}
              reducedMotion={Boolean(reduceMotion)}
              selectedPlanet={previewPlanet}
              settingsOpen={settingsOpen}
            />
            <SettingsSheet onOpenChange={setSettingsOpen} open={settingsOpen}>
              <Inspector planetId={presentedPlanet} />
            </SettingsSheet>
          </>
        ) : (
          <AnimatePresence custom={chromeTransition} initial={false}>
            <motion.aside
              key={presentedPlanet}
              animate="center"
              custom={chromeTransition}
              exit="exit"
              initial="enter"
              variants={chromeVariants}
              {...stylex.props(styles.inspector)}
            >
              <Inspector planetId={presentedPlanet} />
            </motion.aside>
          </AnimatePresence>
        )}

        {showGrid && <LayoutGridOverlay />}
      </div>
    </ShowcaseContext.Provider>
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
      flex: '1 1 auto',
      gridColumn: 'auto',
      order: 0,
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
      '--showcase-canvas-left': 'calc(50% - 50vw)',
      '--showcase-canvas-right': 'calc(50% - 50vw)',
      '--showcase-canvas-top':
        'calc(-1 * (var(--showcase-title-pad) + var(--showcase-stage-nudge)))',
      '--showcase-inspector-width': '0px',
      '--showcase-picker-width': '0px',
      '--showcase-preview-top': '0px',
      '--showcase-stage-nudge': '176px',
      '--showcase-title-pad': '88px',
      display: 'flex',
      flexDirection: 'column',
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
