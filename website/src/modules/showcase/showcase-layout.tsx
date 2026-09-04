import * as stylex from '@stylexjs/stylex'
import { Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { Provider, createStore, useAtomValue } from 'jotai'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import { PlanetWheel, SettingsSheet } from '../../planet-wheel'
import { useMobileShowcase } from './use-mobile-showcase'
import { buildTextLighting, chromeInk, noneTextLighting, observedSunWash } from './chrome-ink'
import { useThrottledAtomValue } from './use-throttled-atom-value'
import { Inspector } from './inspector'
import { PlanetPicker } from './planet-picker'
import { chromeVariants, getPlanetTransitionPlan } from './planet-transition'
import type { ChromeTransitionContext } from './planet-transition'
import { ShowcaseContext } from './showcase-context'
import type { ShowcaseContextValue } from './showcase-context'
import { isPlanetId, planets } from './showcase-data'
import type { PlanetId } from './showcase-data'
import { eclipseHaloAtom, moonLightingAtom, observedSunLightingAtom } from './showcase-settings'

function EclipseLightingPage({
  children,
  previewPlanet,
}: {
  children: ReactNode
  previewPlanet: PlanetId
}) {
  const eclipse = useAtomValue(eclipseHaloAtom)
  const moon = useAtomValue(moonLightingAtom)
  const observedSun = useThrottledAtomValue(observedSunLightingAtom, 80)
  const lighting =
    previewPlanet === 'lunar-eclipse'
      ? buildTextLighting({
          haloEnergy: Math.min(
            Math.max((eclipse.haloIntensity / 3) * Math.sqrt(eclipse.haloWidth), 0),
            1,
          ),
          offsetX: eclipse.offsetX,
          offsetY: eclipse.offsetY,
          rimHue: 220,
        })
      : previewPlanet === 'moon'
        ? buildTextLighting({
            haloEnergy: Math.min(
              0.12 +
                Math.min(Math.max(1 - moon.sunElevation / 70, 0), 1) * 0.18 +
                Math.min(Math.max(moon.earthshineIntensity / 40, 0), 1) * 0.4,
              1,
            ),
            offsetX:
              -Math.sin((moon.sunAzimuth * Math.PI) / 180) *
              Math.cos((moon.sunElevation * Math.PI) / 180) *
              2.2,
            offsetY: -Math.sin((moon.sunElevation * Math.PI) / 180) * 2.2,
            rimHue: 75,
          })
        : previewPlanet === 'observed-sun'
          ? { ...noneTextLighting(), ...chromeInk(observedSunWash(observedSun)) }
          : noneTextLighting()

  return (
    <div {...stylex.props(styles.page)} style={lighting}>
      {children}
    </div>
  )
}

export function ShowcaseLayout() {
  const routePlanet = useParams({ strict: false, select: (params) => params.planet })
  const selectedPlanet = isPlanetId(routePlanet) ? routePlanet : 'earth'
  const navigate = useNavigate()
  const [showGrid, setShowGrid] = useState(false)
  const [transitionDirection, setTransitionDirection] = useState<-1 | 1>(1)
  const [plan, setPlan] = useState(() => getPlanetTransitionPlan(selectedPlanet, selectedPlanet))
  const [previewPlanet, setPreviewPlanet] = useState<PlanetId>(selectedPlanet)
  const [departingPlanet, setDepartingPlanet] = useState<PlanetId | null>(null)
  const [jotaiStore] = useState(createStore)
  const [presentedPlanet, setPresentedPlanet] = useState<PlanetId>(selectedPlanet)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isMobile = useMobileShowcase()
  const selectedPlanetRef = useRef<PlanetId>(selectedPlanet)
  const transitionInFlightRef = useRef(false)
  const queuedPlanetRef = useRef<PlanetId | null>(null)
  const reduceMotion = useReducedMotion()
  const chromeTransition: ChromeTransitionContext = {
    direction: transitionDirection,
    reducedMotion: Boolean(reduceMotion),
  }
  const expandedPreviewActive =
    previewPlanet === 'earth' ||
    previewPlanet === 'moon' ||
    previewPlanet === 'lunar-eclipse' ||
    previewPlanet === 'observed-sun' ||
    departingPlanet === 'earth' ||
    departingPlanet === 'moon' ||
    departingPlanet === 'lunar-eclipse' ||
    departingPlanet === 'observed-sun'
  const planet = planets.find(({ id }) => id === presentedPlanet) ?? planets[0]

  const startPlanetTransition = useCallback(
    (nextPlanet: PlanetId, updateRoute = true): void => {
      const currentPlanet = selectedPlanetRef.current
      if (nextPlanet === currentPlanet) return

      const currentIndex = planets.findIndex(({ id }) => id === currentPlanet)
      const nextIndex = planets.findIndex(({ id }) => id === nextPlanet)
      const nextPlan = getPlanetTransitionPlan(currentPlanet, nextPlanet)
      transitionInFlightRef.current = true
      selectedPlanetRef.current = nextPlanet
      setDepartingPlanet(currentPlanet)
      setPreviewPlanet(nextPlanet)
      setTransitionDirection(nextIndex > currentIndex ? 1 : -1)
      setPlan(nextPlan)
      setPresentedPlanet(nextPlanet)
      if (updateRoute) {
        void navigate({ params: { planet: nextPlanet }, resetScroll: false, to: '/$planet' })
      }
    },
    [navigate],
  )

  const selectPlanet = useCallback(
    (nextPlanet: PlanetId): void => {
      if (nextPlanet === selectedPlanetRef.current) {
        queuedPlanetRef.current = null
        if (nextPlanet !== selectedPlanet) {
          void navigate({ params: { planet: nextPlanet }, resetScroll: false, to: '/$planet' })
        }
        return
      }

      if (transitionInFlightRef.current) {
        queuedPlanetRef.current = nextPlanet
        return
      }

      startPlanetTransition(nextPlanet)
    },
    [navigate, selectedPlanet, startPlanetTransition],
  )

  const completePlanetTransition = useCallback((): void => {
    setPresentedPlanet(selectedPlanetRef.current)
    setDepartingPlanet(null)
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
      completePlanetTransition,
      expandedPreviewActive,
      plan,
      planet,
      previewPlanet,
      transitionDirection,
    }),
    [
      completePlanetTransition,
      expandedPreviewActive,
      plan,
      planet,
      previewPlanet,
      transitionDirection,
    ],
  )

  return (
    <Provider store={jotaiStore}>
      <ShowcaseContext.Provider value={showcaseContext}>
        <EclipseLightingPage previewPlanet={previewPlanet}>
          <PlanetPicker
            gridVisible={showGrid}
            onGridVisibleChange={setShowGrid}
            onSelectPlanet={selectPlanet}
            reducedMotion={Boolean(reduceMotion)}
            selectedPlanet={selectedPlanet}
          />

          <main {...stylex.props(styles.content)}>
            <Outlet />
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
        </EclipseLightingPage>
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
})
