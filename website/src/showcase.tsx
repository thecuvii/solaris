import { Button } from '@base-ui/react/button'
import { NumberField } from '@base-ui/react/number-field'
import { PreviewCard } from '@base-ui/react/preview-card'
import { Slider } from '@base-ui/react/slider'
import { Switch } from '@base-ui/react/switch'
import { createHighlighterCoreSync } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import tsx from '@shikijs/langs/tsx'
import vesper from '@shikijs/themes/vesper'
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
import NumberFlow, { continuous } from '@number-flow/react'
import { Link, Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { useClipboard } from 'foxact/use-clipboard'
import { Provider, createStore, useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import type { Variants } from 'motion/react'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { TextMorph } from 'torph/react'

import { PlanetWheel, SettingsSheet, useMobileShowcase } from './planet-wheel'
import { getPlanetTextureDocs, isPlanetId, planets, textures } from './showcase-data'
import type { Planet, PlanetId, TextureDoc, TexturedPlanetId } from './showcase-data'
import {
  initialSettings,
  parameterDefinitions,
  parameterGroupsByPlanet,
  planetPresets,
} from './showcase-params'
import type { ParameterDefinition, PlanetSettings } from './showcase-params'
import {
  applyPlanetSettingsAtom,
  eclipseHaloAtom,
  isDefaultPlanetAtom,
  moonLightingAtom,
  observedSunLightingAtom,
  planetSettingsAtom,
  resetPlanetSettingsAtom,
  settingAtom,
} from './showcase-settings'

type PlanetTransitionContext = {
  direction: -1 | 1
  plan: PlanetTransitionPlan
  reducedMotion: boolean
}

type ChromeTransitionContext = {
  direction: -1 | 1
  reducedMotion: boolean
}

type PlanetTransitionPlan = {
  duration: number
  /** Fade in place. Used when a full-bleed field would look wrong if it slid. */
  hold?: boolean
}

type EclipseTextLightingProperties = CSSProperties & {
  '--eclipse-introduction-filter': string
  '--eclipse-introduction-shadow': string
  '--eclipse-navigation-filter': string
}

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

const linear = 'linear' as const

function getPlanetTransitionPlan(from: PlanetId, to: PlanetId): PlanetTransitionPlan {
  if (from === 'observed-sun' || to === 'observed-sun') {
    return {
      duration: 0.48,
      hold: true,
    }
  }

  if ((from === 'moon' && to === 'lunar-eclipse') || (from === 'lunar-eclipse' && to === 'moon')) {
    return {
      duration: 0.56,
    }
  }

  return {
    duration: 0.62,
  }
}

function slideTransform(x: number, scale: number, rotation: number): string {
  return `translate3d(${x}%, 0, 0) scale(${scale}) rotateZ(${rotation}deg)`
}

const highlighter = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  langs: [tsx],
  themes: [vesper],
})

const planetPreviewVariants: Variants = {
  center: ({ plan, reducedMotion }: PlanetTransitionContext) => {
    if (reducedMotion || plan.hold) {
      return {
        opacity: 1,
        transform: slideTransform(0, 1, 0),
        transition: reducedMotion
          ? { duration: 0.14, ease: linear }
          : { duration: plan.duration, ease: [0.22, 1, 0.36, 1] },
      }
    }

    return {
      opacity: 1,
      transform: slideTransform(0, 1, 0),
      transition: {
        opacity: { delay: plan.duration * 0.08, duration: plan.duration * 0.3, ease: linear },
        transform: { duration: plan.duration, ease: [0.4, 0, 0.2, 1] },
      },
    }
  },
  enter: ({ direction, plan, reducedMotion }: PlanetTransitionContext) => ({
    opacity: 0,
    transform:
      reducedMotion || plan.hold
        ? slideTransform(0, 1, 0)
        : slideTransform(direction * 82, 0.94, direction * 2),
  }),
  exit: ({ direction, plan, reducedMotion }: PlanetTransitionContext) => {
    if (reducedMotion || plan.hold) {
      return {
        opacity: 0,
        transform: slideTransform(0, 1, 0),
        transition: reducedMotion
          ? { duration: 0.14, ease: linear }
          : { duration: plan.duration, ease: [0.22, 1, 0.36, 1] },
      }
    }

    return {
      opacity: [1, 1, 0],
      transform: slideTransform(direction * -82, 0.94, direction * -2),
      transition: {
        opacity: { duration: plan.duration, ease: linear, times: [0, 0.72, 1] },
        transform: { duration: plan.duration, ease: [0.4, 0, 0.2, 1] },
      },
    }
  },
}

const chromeTravel = 12

const chromeVariants: Variants = {
  center: ({ reducedMotion }: ChromeTransitionContext) => ({
    opacity: 1,
    transform: 'translate3d(0px, 0, 0)',
    transition: reducedMotion
      ? { duration: 0.14, ease: linear }
      : { delay: 0.04, duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  }),
  enter: ({ direction, reducedMotion }: ChromeTransitionContext) => ({
    opacity: 0,
    transform: reducedMotion
      ? 'translate3d(0px, 0, 0)'
      : `translate3d(${direction * chromeTravel}px, 0, 0)`,
  }),
  exit: ({ direction, reducedMotion }: ChromeTransitionContext) => ({
    opacity: 0,
    transform: reducedMotion
      ? 'translate3d(0px, 0, 0)'
      : `translate3d(${direction * -chromeTravel}px, 0, 0)`,
    transition: reducedMotion
      ? { duration: 0.14, ease: linear }
      : { duration: 0.14, ease: [0.22, 1, 0.36, 1] },
  }),
}

type ShowcaseContextValue = {
  completePlanetTransition: () => void
  expandedPreviewActive: boolean
  plan: PlanetTransitionPlan
  planet: Planet
  previewPlanet: PlanetId
  transitionDirection: -1 | 1
}

const ShowcaseContext = createContext<ShowcaseContextValue | null>(null)

function noneTextLighting(): EclipseTextLightingProperties {
  return {
    '--eclipse-introduction-filter': 'none',
    '--eclipse-introduction-shadow': 'none',
    '--eclipse-navigation-filter': 'none',
  }
}

function buildTextLighting({
  haloEnergy,
  offsetX,
  offsetY,
  rimHue,
}: {
  haloEnergy: number
  offsetX: number
  offsetY: number
  rimHue: number
}): EclipseTextLightingProperties {
  if (haloEnergy === 0) return noneTextLighting()

  const visibleHaloResponse = (1 - Math.exp(-6 * haloEnergy)) / (1 - Math.exp(-6))
  const shadowDistance = 0.6 + haloEnergy * 1.3
  const shadowAlpha = visibleHaloResponse * (0.3 + haloEnergy * 0.22)
  const rimAlpha = visibleHaloResponse * 0.18
  const navigationRimAlpha = visibleHaloResponse * 0.22
  const rimScale = (0.25 + visibleHaloResponse * 0.35) / shadowDistance
  const detailShadowScale = 0.65
  const navigationShadowScale = 0.75
  const horizontalBias = Math.min(Math.max(offsetX / 2.5, -1), 1)
  const verticalBias = Math.min(Math.max(-offsetY / 2.5, -1), 1)
  const introductionShadowX = -shadowDistance * (0.28 + horizontalBias * 0.22)
  const introductionShadowY = -shadowDistance * (0.72 + verticalBias * 0.28)
  const navigationShadowX = -shadowDistance * (0.72 + horizontalBias * 0.28)
  const navigationShadowY = shadowDistance * 0.08
  const shadowBlur = 0.35 + haloEnergy * 0.45
  const rimBlur = 0.15 + haloEnergy * 0.2
  const rim = `oklch(86% 0.08 ${rimHue}`

  return {
    '--eclipse-introduction-filter': `drop-shadow(${introductionShadowX.toFixed(2)}px ${introductionShadowY.toFixed(2)}px ${shadowBlur.toFixed(2)}px oklch(0% 0 0 / ${shadowAlpha.toFixed(3)})) drop-shadow(${(-introductionShadowX * rimScale).toFixed(2)}px ${(-introductionShadowY * rimScale).toFixed(2)}px ${rimBlur.toFixed(2)}px ${rim} / ${rimAlpha.toFixed(3)}))`,
    '--eclipse-introduction-shadow': `${(introductionShadowX * detailShadowScale).toFixed(2)}px ${(introductionShadowY * detailShadowScale).toFixed(2)}px ${shadowBlur.toFixed(2)}px oklch(0% 0 0 / ${shadowAlpha.toFixed(3)}), ${(-introductionShadowX * rimScale * detailShadowScale).toFixed(2)}px ${(-introductionShadowY * rimScale * detailShadowScale).toFixed(2)}px ${rimBlur.toFixed(2)}px ${rim} / ${rimAlpha.toFixed(3)})`,
    '--eclipse-navigation-filter': `drop-shadow(${(navigationShadowX * navigationShadowScale).toFixed(2)}px ${(navigationShadowY * navigationShadowScale).toFixed(2)}px ${shadowBlur.toFixed(2)}px oklch(0% 0 0 / ${shadowAlpha.toFixed(3)})) drop-shadow(${(-navigationShadowX * rimScale * navigationShadowScale).toFixed(2)}px ${(-navigationShadowY * rimScale * navigationShadowScale).toFixed(2)}px ${rimBlur.toFixed(2)}px ${rim} / ${navigationRimAlpha.toFixed(3)}))`,
  }
}

function EclipseLightingPage({
  children,
  previewPlanet,
}: {
  children: ReactNode
  previewPlanet: PlanetId
}) {
  const eclipse = useAtomValue(eclipseHaloAtom)
  const moon = useAtomValue(moonLightingAtom)
  const observedSun = useAtomValue(observedSunLightingAtom)
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
          ? buildTextLighting({
              haloEnergy: Math.min(
                0.08 +
                  Math.min(Math.max(observedSun.glare, 0), 2) * 0.42 +
                  Math.min(Math.max(observedSun.exposure, 0), 4) * 0.06 +
                  Math.min(Math.max(observedSun.field, 0), 1) * 0.16 +
                  Math.min(Math.max(observedSun.duskFlush, 0), 1) * 0.06,
                1,
              ),
              offsetX: 0,
              offsetY: -Math.sin((observedSun.sunElevation * Math.PI) / 180) * 2.2,
              rimHue: 48 + observedSun.duskFlush * 292,
            })
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
    previewPlanet === 'moon' ||
    previewPlanet === 'lunar-eclipse' ||
    previewPlanet === 'observed-sun' ||
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

export function ShowcasePlanetPage() {
  const context = useContext(ShowcaseContext)
  const reduceMotion = useReducedMotion()
  if (!context) throw new Error('ShowcasePlanetPage must be rendered inside ShowcaseLayout')

  const {
    completePlanetTransition,
    expandedPreviewActive,
    plan,
    planet,
    previewPlanet,
    transitionDirection,
  } = context
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
                  (previewPlanet === 'moon' ||
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

const PlanetPicker = memo(function PlanetPicker({
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

function PlanetPreviewWithSettings({ id }: { id: PlanetId }) {
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
      return <Earth {...shared} model={earthModel} textures={textures.earth} />
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

function PlanetIntroduction({
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

function PresetGrid({ planetId }: { planetId: PlanetId }) {
  const applyPlanetSettings = useSetAtom(applyPlanetSettingsAtom)
  const presets = planetPresets[planetId]

  return (
    <section {...stylex.props(styles.parameterGroup)}>
      <h2 {...stylex.props(styles.groupTitle)}>Preset</h2>
      <div aria-label="Preset" {...stylex.props(styles.presetGrid)}>
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => applyPlanetSettings({ planetId, values: preset.values })}
            type="button"
            {...stylex.props(styles.presetCard)}
          >
            <span {...stylex.props(styles.presetFrame)}>
              <img
                alt=""
                draggable={false}
                height={64}
                src={preset.image}
                width={64}
                {...stylex.props(styles.presetImage)}
              />
            </span>
            <span {...stylex.props(styles.presetLabel)}>{preset.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Inspector({ planetId }: { planetId: PlanetId }) {
  const groups = parameterGroupsByPlanet.get(planetId) ?? []

  return (
    <>
      <div {...stylex.props(styles.inspectorGroups)}>
        <PresetGrid planetId={planetId} />
        {groups.map((group) => (
          <ParameterGroup
            key={group.id}
            definitions={group.definitions}
            label={group.label}
            planetId={planetId}
          />
        ))}
      </div>

      <ResetSettingsButton planetId={planetId} />
    </>
  )
}

function ResetSettingsButton({ planetId }: { planetId: PlanetId }) {
  const isDefault = useAtomValue(isDefaultPlanetAtom(planetId))
  const resetPlanetSettings = useSetAtom(resetPlanetSettingsAtom)

  return (
    <Button
      disabled={isDefault}
      onClick={() => resetPlanetSettings(planetId)}
      {...stylex.props(styles.resetButton, isDefault && styles.resetButtonDisabled)}
    >
      <ResetIcon />
      Reset
    </Button>
  )
}

function ParameterGroup({
  definitions,
  label,
  planetId,
}: {
  definitions: readonly ParameterDefinition[]
  label: string
  planetId: PlanetId
}) {
  return (
    <section {...stylex.props(styles.parameterGroup)}>
      <h2 {...stylex.props(styles.groupTitle)}>{label}</h2>
      <div {...stylex.props(styles.controlGroup)}>
        {definitions.map((definition) => (
          <ParameterControl key={definition.name} definition={definition} planetId={planetId} />
        ))}
      </div>
    </section>
  )
}

const ParameterControl = memo(function ParameterControl({
  definition,
  planetId,
}: {
  definition: ParameterDefinition
  planetId: PlanetId
}) {
  const [value, setValue] = useAtom(settingAtom({ name: definition.name, planetId }))
  const updateValue = useCallback(
    (nextValue: boolean | number) => {
      if (definition.kind === 'boolean') {
        setValue(nextValue)
        return
      }

      const clampedValue = Math.min(Math.max(Number(nextValue), definition.min), definition.max)
      const quantizedValue =
        definition.min +
        Math.round((clampedValue - definition.min) / definition.step) * definition.step
      setValue(Number(quantizedValue.toFixed(12)))
    },
    [definition, setValue],
  )

  return definition.kind === 'number' ? (
    <ParameterSlider
      label={definition.label}
      max={definition.max}
      min={definition.min}
      onValueChange={updateValue}
      step={definition.step}
      suffix={definition.suffix}
      value={Number(value)}
    />
  ) : (
    <ParameterSwitch
      checked={Boolean(value)}
      label={definition.label}
      onCheckedChange={updateValue}
    />
  )
})

const ParameterSwitch = memo(function ParameterSwitch({
  checked,
  compact = false,
  label,
  onCheckedChange,
}: {
  checked: boolean
  compact?: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label {...stylex.props(styles.switchLabel, compact && styles.switchLabelCompact)}>
      <span>{label}</span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        {...stylex.props(styles.switchRoot, checked && styles.switchRootChecked)}
      >
        <Switch.Thumb {...stylex.props(styles.switchThumb, checked && styles.switchThumbChecked)} />
      </Switch.Root>
    </label>
  )
})

const ParameterSlider = memo(function ParameterSlider({
  label,
  max,
  min,
  onValueChange,
  step,
  suffix = '',
  value,
}: {
  label: string
  max: number
  min: number
  onValueChange: (value: number) => void
  step: number
  suffix?: string
  value: number
}) {
  const precision = getPrecision(step)

  function clampValue(nextValue: number, lower: number, upper: number): number {
    return Math.min(Math.max(nextValue, lower), upper)
  }

  const getNormalizedValue = useCallback(
    (nextValue: number) => Math.min(Math.max((nextValue - min) / (max - min), 0), 1),
    [max, min],
  )

  function quantizeValue(nextValue: number): number {
    const clampedValue = clampValue(nextValue, min, max)
    if (clampedValue === min || clampedValue === max) return clampedValue

    const quantized = min + Math.round((clampedValue - min) / step) * step
    return clampValue(Number(quantized.toFixed(12)), min, max)
  }

  function getClickValue(nextValue: number, nextProgress: number): number {
    const stepCount = (max - min) / step
    if (stepCount <= 10) return quantizeValue(nextValue)

    const nearestDecile = Math.round(nextProgress * 10) / 10
    const snappedValue =
      Math.abs(nextProgress - nearestDecile) <= 0.03125
        ? min + nearestDecile * (max - min)
        : nextValue
    return quantizeValue(snappedValue)
  }

  const reduceMotion = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const valueRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pointerRef = useRef<{
    id: number
    moved: boolean
    startX: number
    startY: number
  } | null>(null)
  const interactingRef = useRef(false)
  const editingRef = useRef(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animationRef = useRef<ReturnType<typeof animate> | null>(null)
  const progress = useMotionValue(getNormalizedValue(value))
  const handleOpacity = useMotionValue(1)
  const fillWidth = useTransform(progress, (current) => `${current * 100}%`)
  const [hovered, setHovered] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [focused, setFocused] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editArmed, setEditArmed] = useState(false)
  const [draftValue, setDraftValue] = useState<number | null>(value)
  const active = hovered || interacting || focused || editing
  const atMaximum = value >= max

  function clearHoverTimer() {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  function setGestureActive(next: boolean) {
    interactingRef.current = next
    setInteracting(next)
  }

  const animateTo = useCallback(
    (nextProgress: number, bounce = 0.18) => {
      animationRef.current?.stop()
      if (reduceMotion) {
        progress.set(nextProgress)
        return
      }
      animationRef.current = animate(progress, nextProgress, {
        bounce,
        duration: 0.35,
        type: 'spring',
      })
    },
    [progress, reduceMotion],
  )

  function updateFromPointer(clientX: number, click: boolean) {
    const track = trackRef.current
    if (!track) return value

    const rect = track.getBoundingClientRect()
    const scale = rect.width / track.offsetWidth || 1
    const localX = (clientX - rect.left) / scale
    const rawProgress = localX / track.offsetWidth
    const nextProgress = clampValue(rawProgress, 0, 1)

    progress.set(nextProgress)

    const rawValue = min + nextProgress * (max - min)
    return click ? getClickValue(rawValue, nextProgress) : quantizeValue(rawValue)
  }

  const cancelGesture = useCallback(() => {
    if (!pointerRef.current) return
    pointerRef.current = null
    interactingRef.current = false
    setInteracting(false)
    animateTo(getNormalizedValue(value), 0.1)
  }, [animateTo, getNormalizedValue, value])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    animationRef.current?.stop()
    pointerRef.current = {
      id: event.pointerId,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setGestureActive(true)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return

    if (
      !pointer.moved &&
      Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= 3
    ) {
      pointer.moved = true
    }
    if (!pointer.moved) return

    onValueChange(updateFromPointer(event.clientX, false))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return

    const nextValue = updateFromPointer(event.clientX, !pointer.moved)
    onValueChange(nextValue)
    pointerRef.current = null
    setGestureActive(false)
    animateTo(getNormalizedValue(nextValue))
  }

  function beginEditing() {
    clearHoverTimer()
    editingRef.current = true
    setDraftValue(value)
    setEditing(true)
    queueMicrotask(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function commitEditing() {
    if (!editingRef.current) return
    editingRef.current = false
    setEditing(false)
    setEditArmed(false)
    if (draftValue === null || !Number.isFinite(draftValue)) {
      setDraftValue(value)
      return
    }

    const nextValue = quantizeValue(draftValue)
    setDraftValue(nextValue)
    onValueChange(nextValue)
  }

  function cancelEditing() {
    editingRef.current = false
    setDraftValue(value)
    setEditing(false)
    setEditArmed(false)
  }

  useEffect(() => {
    if (interactingRef.current || editingRef.current) return
    animateTo(getNormalizedValue(value), 0.12)
    setDraftValue(value)
  }, [animateTo, getNormalizedValue, value])

  useEffect(() => {
    function updateHandleOpacity(current = progress.get()) {
      const track = trackRef.current
      const labelElement = labelRef.current
      const valueElement = valueRef.current
      if (!track || !labelElement || !valueElement) return

      const handleX = current * track.offsetWidth
      const labelEnd = labelElement.offsetLeft + labelElement.offsetWidth + 12
      const valueStart = valueElement.offsetLeft - 12
      handleOpacity.set(
        Math.min(
          Math.min(Math.max((handleX - labelEnd) / 10, 0), 1),
          Math.min(Math.max((valueStart - handleX) / 10, 0), 1),
        ),
      )
    }

    updateHandleOpacity()
    const stopListening = progress.on('change', updateHandleOpacity)
    const resizeObserver = new ResizeObserver(() => updateHandleOpacity())
    if (trackRef.current) resizeObserver.observe(trackRef.current)
    if (labelRef.current) resizeObserver.observe(labelRef.current)
    if (valueRef.current) resizeObserver.observe(valueRef.current)

    return () => {
      stopListening()
      resizeObserver.disconnect()
    }
  }, [handleOpacity, progress])

  useEffect(() => {
    window.addEventListener('blur', cancelGesture)
    return () => window.removeEventListener('blur', cancelGesture)
  }, [cancelGesture])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current)
      animationRef.current?.stop()
    }
  }, [])

  return (
    <NumberField.Root
      format={{ maximumFractionDigits: precision, minimumFractionDigits: precision }}
      max={max}
      min={min}
      onValueChange={(nextValue) => {
        if (editingRef.current) setDraftValue(nextValue)
      }}
      snapOnStep
      step={step}
      value={editing ? draftValue : value}
      {...stylex.props(styles.numberFieldRoot)}
    >
      <Slider.Root
        aria-label={label}
        max={max}
        min={min}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
        }}
        onFocusCapture={() => setFocused(true)}
        onValueChange={onValueChange}
        step={step}
        value={value}
        {...stylex.props(styles.sliderRoot)}
      >
        <motion.div
          ref={trackRef}
          onLostPointerCapture={cancelGesture}
          onPointerCancel={cancelGesture}
          onPointerDown={handlePointerDown}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => {
            setHovered(false)
            clearHoverTimer()
            if (!editingRef.current) setEditArmed(false)
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          {...stylex.props(styles.sliderTrack)}
        >
          <motion.div
            style={{ width: fillWidth }}
            {...stylex.props(
              styles.sliderIndicator,
              active && styles.sliderIndicatorActive,
              atMaximum && styles.sliderIndicatorAtMaximum,
            )}
          />
          <span ref={labelRef} title={label} {...stylex.props(styles.sliderLabel)}>
            {label}
          </span>
          <span ref={valueRef} {...stylex.props(styles.numberFieldValue)}>
            <span {...stylex.props(styles.numberFieldDigits)}>
              {!editing && (
                <SliderValueMorph
                  active={active || editArmed}
                  precision={precision}
                  value={value}
                />
              )}
              <NumberField.Input
                ref={inputRef}
                aria-label={`${label} value`}
                readOnly={!editing}
                onBlur={commitEditing}
                onFocus={() => {
                  if (!editingRef.current) {
                    editingRef.current = true
                    setDraftValue(value)
                    setEditing(true)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelEditing()
                    event.currentTarget.blur()
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    commitEditing()
                    event.currentTarget.blur()
                  }
                }}
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse' && !editArmed) {
                    event.preventDefault()
                    return
                  }
                  event.stopPropagation()
                  beginEditing()
                }}
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'mouse' || editingRef.current) return
                  clearHoverTimer()
                  hoverTimerRef.current = setTimeout(() => {
                    setEditArmed(true)
                    hoverTimerRef.current = null
                  }, 800)
                }}
                onPointerLeave={() => {
                  clearHoverTimer()
                  if (!editingRef.current) setEditArmed(false)
                }}
                {...stylex.props(
                  styles.numberFieldInput,
                  editing && (active || editArmed) && styles.numberFieldInputActive,
                  !editing && styles.numberFieldInputGhost,
                )}
              />
            </span>
            {suffix && (
              <span
                {...stylex.props(
                  styles.numberFieldSuffix,
                  (active || editArmed) && styles.numberFieldSuffixActive,
                )}
              >
                {suffix}
              </span>
            )}
          </span>
          <motion.div
            aria-hidden="true"
            style={{ left: fillWidth, opacity: handleOpacity }}
            {...stylex.props(styles.sliderThumb, active && styles.sliderThumbActive)}
          />
        </motion.div>
        <Slider.Control {...stylex.props(styles.sliderControl)}>
          <Slider.Track {...stylex.props(styles.sliderSemanticTrack)}>
            <Slider.Thumb aria-label={label} {...stylex.props(styles.sliderSemanticThumb)} />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </NumberField.Root>
  )
})

const numberFlowTimings = {
  opacityTiming: { duration: 160, easing: 'ease-out' },
  spinTiming: { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  transformTiming: { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
} as const

function numberFlowFormat(precision: number) {
  return {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
    useGrouping: false,
  } as const
}

function SliderValueMorph({
  active,
  precision,
  value,
}: {
  active: boolean
  precision: number
  value: number
}) {
  return (
    <NumberFlow
      aria-hidden="true"
      format={numberFlowFormat(precision)}
      isolate
      plugins={[continuous]}
      value={value}
      willChange
      {...numberFlowTimings}
      {...stylex.props(styles.numberFieldMorph, active && styles.numberFieldMorphActive)}
    />
  )
}

function ResetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" {...stylex.props(styles.resetIcon)}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
      >
        <path d="M4.25 9.25L4 9.25C2.20508 9.25 0.75 7.79493 0.750001 6C0.750001 4.20507 2.20507 2.75 4 2.75L5.25 2.75L4 1" />
        <path d="M7.75 2.75L8 2.75C9.79492 2.75 11.25 4.20508 11.25 6C11.25 7.79493 9.79493 9.25 8 9.25L6.75 9.25L8 11" />
      </g>
    </svg>
  )
}

function formatSettingValue(definition: ParameterDefinition, value: boolean | number): string {
  if (typeof value === 'boolean' || definition.kind === 'boolean') return String(value)
  return Number(value).toFixed(getPrecision(definition.step))
}

function buildExampleCode(planet: Planet, settings: PlanetSettings): string {
  const componentName = planet.componentName ?? planet.name
  const planetTextures = hasTextures(planet.id) ? textures[planet.id] : undefined
  const textureDeclaration = planetTextures
    ? `const textures = {
${Object.entries(planetTextures)
  .map(([name, source]) => `  ${name}: '${source}',`)
  .join('\n')}
}

`
    : ''
  const modelDeclaration =
    planet.id === 'earth'
      ? `const earthModel = {
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

`
      : ''
  const propLines = [
    planetTextures && '  textures={textures}',
    planet.id === 'earth' && '  model={earthModel}',
    ...parameterDefinitions[planet.id].map((definition) => {
      return `  ${definition.name}={${formatSettingValue(definition, settings[definition.name])}}`
    }),
  ].filter(Boolean)
  return `import { ${componentName} } from '@thecuvii/solaris/${planet.packageName}'

${textureDeclaration}${modelDeclaration}<${componentName}
${propLines.join('\n')}
/>`
}

function AnimatedCodeValue({
  color,
  definition,
  planetId,
}: {
  color: string | undefined
  definition: ParameterDefinition
  planetId: PlanetId
}) {
  const setting = useAtomValue(settingAtom({ name: definition.name, planetId }))

  if (definition.kind === 'boolean') {
    return (
      <span style={{ color }}>
        <TextMorph as="span" duration={400} scale style={{ verticalAlign: 'baseline' }}>
          {String(setting)}
        </TextMorph>
      </span>
    )
  }

  const effectValue = Number(setting)
  const precision = getPrecision(definition.step)

  return (
    <NumberFlow
      format={numberFlowFormat(precision)}
      isolate
      plugins={[continuous]}
      style={{ color }}
      value={effectValue}
      willChange
      {...numberFlowTimings}
      {...stylex.props(styles.codeNumberFlow)}
    />
  )
}

function CodeBlock({ planet }: { planet: Planet }) {
  const { copied, copy } = useClipboard({ timeout: 1500 })
  const reduceMotion = useReducedMotion()
  const store = useStore()
  const fileStem = planet.componentName ?? planet.name
  const highlightedCode = useMemo(() => {
    const staticCode = buildExampleCode(planet, initialSettings[planet.id])
    const ranges = parameterDefinitions[planet.id].map((definition) => {
      const propertyPrefix = `  ${definition.name}=`
      const value = formatSettingValue(definition, initialSettings[planet.id][definition.name])
      const start = staticCode.indexOf(propertyPrefix) + propertyPrefix.length + 1
      return { definition, end: start + value.length, start }
    })
    const lines = highlighter.codeToTokensBase(staticCode, {
      lang: 'tsx',
      theme: 'vesper',
    })

    return { lines, ranges }
  }, [planet])

  return (
    <section {...stylex.props(styles.codeSection)}>
      <div {...stylex.props(styles.codeHeader)}>
        <div {...stylex.props(styles.codeFile)}>
          <CodeFileIcon />
          <span>
            <TextMorph
              as="span"
              disabled={Boolean(reduceMotion)}
              duration={220}
              ease="cubic-bezier(0.22, 1, 0.36, 1)"
              scale={false}
            >
              {fileStem}
            </TextMorph>
            .tsx
          </span>
        </div>
        <Button
          aria-label={copied ? 'Code copied' : 'Copy code'}
          onClick={() =>
            void copy(buildExampleCode(planet, store.get(planetSettingsAtom(planet.id))))
          }
          type="button"
          {...stylex.props(styles.codeFile, styles.codeCopy, copied && styles.codeCopyCopied)}
        >
          <CopyIcon copied={copied} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre {...stylex.props(styles.code)}>
        <code>
          {highlightedCode.lines.map((line, lineIndex) => (
            <span key={line[0]?.offset ?? `blank-${lineIndex}`}>
              {line.map((token) => {
                const animatedValue = highlightedCode.ranges.find(
                  ({ end, start }) =>
                    token.offset < end && token.offset + token.content.length > start,
                )
                if (!animatedValue) {
                  return (
                    <span key={token.offset} style={{ color: token.color }}>
                      {token.content}
                    </span>
                  )
                }
                if (
                  token.offset > animatedValue.start ||
                  token.offset + token.content.length <= animatedValue.start
                ) {
                  return null
                }

                const before = token.content.slice(0, animatedValue.start - token.offset)
                const after = token.content.slice(animatedValue.end - token.offset)
                const valueToken = line.find(
                  ({ offset }) => offset >= animatedValue.start && offset < animatedValue.end,
                )
                return (
                  <span key={token.offset} style={{ color: token.color }}>
                    {before}
                    <AnimatedCodeValue
                      color={valueToken?.color ?? token.color}
                      definition={animatedValue.definition}
                      planetId={planet.id}
                    />
                    {after}
                  </span>
                )
              })}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </section>
  )
}

function TextureDocs({ planetId }: { planetId: PlanetId }) {
  const docs = getPlanetTextureDocs(planetId)

  return (
    <section {...stylex.props(styles.textureSection)}>
      <div {...stylex.props(styles.textureHeadingRow)}>
        <h2 {...stylex.props(styles.textureHeading)}>Textures</h2>
        <TextureHeadingHelp />
      </div>
      {docs.length === 0 ? (
        <p {...stylex.props(styles.textureEmpty)}>
          No texture files. Atmosphere and surface structure are generated in the shader.
        </p>
      ) : (
        <ul {...stylex.props(styles.textureList)}>
          {docs.map((doc) => (
            <TextureDocRow doc={doc} key={`${doc.key}:${doc.url}`} />
          ))}
        </ul>
      )}
    </section>
  )
}

function TextureHeadingHelp() {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        closeDelay={150}
        delay={200}
        render={<button type="button" />}
        {...stylex.props(styles.textureHelpTrigger)}
      >
        what's this?
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          align="center"
          side="top"
          sideOffset={8}
          {...stylex.props(styles.textureHelpPositioner)}
        >
          <PreviewCard.Popup {...stylex.props(styles.textureHelpPopup)}>
            <p {...stylex.props(styles.textureHelpCopy)}>
              The example already uses the hosted textures.
            </p>
            <p {...stylex.props(styles.textureHelpCopy)}>
              Download only if you want to host them yourself.
            </p>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}

function TextureDocRow({ doc }: { doc: TextureDoc }) {
  const { copied, copy } = useClipboard({ timeout: 1500 })
  const file = useTextureFileMeta(doc.url)
  const reduceMotion = useReducedMotion()
  const squarePreview = doc.key === 'observation' || doc.key === 'rings'

  return (
    <li {...stylex.props(styles.textureRow)}>
      <div {...stylex.props(styles.textureThumb)}>
        <img
          alt=""
          decoding="async"
          loading="lazy"
          src={doc.url}
          {...stylex.props(styles.textureThumbImage, squarePreview && styles.textureThumbContain)}
        />
        {doc.packed ? <span {...stylex.props(styles.textureThumbBadge)}>Packed</span> : null}
      </div>
      <div {...stylex.props(styles.textureCopy)}>
        <p {...stylex.props(styles.textureName)}>{doc.label}</p>
        <p {...stylex.props(styles.textureDescription)}>{doc.description}</p>
        <dl {...stylex.props(styles.textureStats)}>
          <div {...stylex.props(styles.textureStat)}>
            <dt {...stylex.props(styles.textureStatLabel)}>Format</dt>
            <dd {...stylex.props(styles.textureStatValue)}>{doc.format}</dd>
          </div>
          <div {...stylex.props(styles.textureStat)}>
            <dt {...stylex.props(styles.textureStatLabel)}>Size</dt>
            <dd {...stylex.props(styles.textureStatValue, styles.textureStatNumber)}>
              {file.bytes == null ? '—' : formatBytes(file.bytes)}
            </dd>
          </div>
          <div {...stylex.props(styles.textureStat)}>
            <dt {...stylex.props(styles.textureStatLabel)}>Resolution</dt>
            <dd {...stylex.props(styles.textureStatValue, styles.textureStatNumber)}>
              {file.width == null || file.height == null ? '—' : `${file.width}×${file.height}`}
            </dd>
          </div>
        </dl>
      </div>
      <div {...stylex.props(styles.textureActions)}>
        <Button
          aria-label={copied ? `${doc.label} URL copied` : `Copy ${doc.label} URL`}
          onClick={() => void copy(doc.url)}
          type="button"
          {...stylex.props(styles.textureAction, copied && styles.textureActionCopied)}
        >
          <CopyIcon copied={copied} />
          <span {...stylex.props(styles.textureActionLabel)}>
            <span aria-hidden="true" {...stylex.props(styles.textureActionLabelSizer)}>
              Copy URL
            </span>
            <span {...stylex.props(styles.textureActionLabelMorph)}>
              <TextMorph
                as="span"
                disabled={Boolean(reduceMotion)}
                duration={220}
                ease="cubic-bezier(0.22, 1, 0.36, 1)"
                scale={false}
              >
                {copied ? 'Copied' : 'Copy URL'}
              </TextMorph>
            </span>
          </span>
        </Button>
        <a
          aria-label={`Download ${doc.filename}`}
          download={doc.filename}
          href={doc.url}
          {...stylex.props(styles.textureAction)}
        >
          <DownloadIcon />
          Download
        </a>
      </div>
    </li>
  )
}

function useTextureFileMeta(url: string) {
  const [meta, setMeta] = useState<{
    bytes: number | null
    height: number | null
    width: number | null
  }>({
    bytes: null,
    height: null,
    width: null,
  })

  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled) {
        setMeta((current) => ({
          ...current,
          height: image.naturalHeight,
          width: image.naturalWidth,
        }))
      }
    }
    image.src = url

    void fetch(url)
      .then(async (response) => {
        const length = Number(response.headers.get('content-length'))
        if (Number.isFinite(length) && length > 0) return length
        return (await response.blob()).size
      })
      .then((bytes) => {
        if (!cancelled) setMeta((current) => ({ ...current, bytes }))
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [url])

  return meta
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(bytes >= 10_485_760 ? 0 : 1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function CodeFileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.codeFileIcon)}>
      <path d="m5.5 5-3 3 3 3M10.5 5l3 3-3 3M9 3.5l-2 9" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.copyIcon)}>
      <path d="M8 2.5v8M5 8l3 3 3-3M3 13.5h10" />
    </svg>
  )
}

const copyIconSwapTransition = { duration: 0.25, ease: 'easeInOut' } as const

function CopyIcon({ copied }: { copied: boolean }) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? { duration: 0 } : copyIconSwapTransition

  return (
    <span aria-hidden="true" {...stylex.props(styles.copyIconSwap)}>
      <motion.span
        animate={{
          filter: copied ? 'blur(2px)' : 'blur(0px)',
          opacity: copied ? 0 : 1,
          scale: copied ? 0.25 : 1,
        }}
        initial={false}
        style={{ gridArea: '1 / 1' }}
        transition={transition}
      >
        <svg viewBox="0 0 16 16" {...stylex.props(styles.copyIcon)}>
          <rect height="9" rx="1.5" width="9" x="5" y="2" />
          <path d="M11 11v1.5A1.5 1.5 0 0 1 9.5 14h-6A1.5 1.5 0 0 1 2 12.5v-6A1.5 1.5 0 0 1 3.5 5H5" />
        </svg>
      </motion.span>
      <motion.span
        animate={{
          filter: copied ? 'blur(0px)' : 'blur(2px)',
          opacity: copied ? 1 : 0,
          scale: copied ? 1 : 0.25,
        }}
        initial={false}
        style={{ gridArea: '1 / 1' }}
        transition={transition}
      >
        <svg viewBox="0 0 16 16" {...stylex.props(styles.copyIcon)}>
          <path d="m3 8.5 3 3 7-7" />
        </svg>
      </motion.span>
    </span>
  )
}

function hasTextures(id: PlanetId): id is TexturedPlanetId {
  return id in textures
}

function getPrecision(step: number): number {
  return step < 0.01 ? 3 : step < 1 ? 2 : 0
}

const styles = stylex.create({
  code: {
    backgroundColor: '#090c14',
    borderRadius: 10,
    color: '#b9b9b9',
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    lineHeight: 1.7,
    margin: 0,
    overflowX: 'auto',
    paddingBlock: 22,
    paddingInline: 18,
  },
  codeFile: {
    alignItems: 'center',
    color: 'rgba(242, 232, 208, 0.5)',
    display: 'flex',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 11,
    fontWeight: 550,
    gap: 6,
    height: 32,
  },
  codeFileIcon: {
    fill: 'none',
    height: 13,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.25,
    width: 13,
  },
  codeNumberFlow: {
    display: 'inline-block',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 0.85,
    verticalAlign: 'baseline',
    '--number-flow-mask-height': '0.12em',
    '--number-flow-mask-width': '0.3em',
  },
  codeHeader: {
    alignItems: 'center',
    display: 'flex',
    height: 46,
    paddingInline: 10,
  },
  codeCopy: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: {
      default: 'rgba(242, 232, 208, 0.5)',
      ':hover': '#f2e8d0',
      ':focus-visible': '#f2e8d0',
    },
    cursor: 'pointer',
    marginLeft: 'auto',
    padding: 0,
    textDecoration: { ':focus-visible': 'underline' },
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': { outline: 'none' },
  },
  codeCopyCopied: {
    color: '#f2e8d0',
  },
  codeSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.028)',
    backgroundImage:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.012))',
    backdropFilter: 'blur(22px) saturate(0.72)',
    borderRadius: 16,
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 16px 40px rgba(0, 0, 0, 0.16)',
    gridColumn: '1 / -1',
    marginTop: 18,
    minWidth: 0,
    overflow: 'hidden',
    paddingBottom: 6,
    paddingInline: 6,
    paddingTop: 0,
  },
  textureAction: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    color: {
      default: 'rgba(242, 232, 208, 0.5)',
      ':hover': '#f2e8d0',
      ':focus-visible': '#f2e8d0',
    },
    cursor: 'pointer',
    display: 'inline-flex',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 11,
    fontWeight: 550,
    gap: 6,
    height: 28,
    justifyContent: 'flex-start',
    padding: 0,
    textDecoration: {
      default: 'none',
      ':focus-visible': 'underline',
    },
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': { outline: 'none' },
  },
  textureActionCopied: {
    color: '#f2e8d0',
  },
  textureActionLabel: {
    display: 'grid',
    justifyItems: 'start',
  },
  textureActionLabelMorph: {
    gridArea: '1 / 1',
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  textureActionLabelSizer: {
    gridArea: '1 / 1',
    visibility: 'hidden',
    whiteSpace: 'nowrap',
  },
  textureActions: {
    display: 'flex',
    gap: 16,
    gridColumn: 1,
    gridRow: 2,
    minWidth: 0,
    '@media (max-width: 960px)': {
      gridRow: 3,
    },
  },
  textureCopy: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: 8,
    gridColumn: 2,
    gridRow: 1,
    minWidth: 0,
    paddingTop: 2,
    '@media (max-width: 960px)': {
      gridColumn: 1,
      gridRow: 2,
    },
  },
  textureDescription: {
    color: 'rgba(242, 232, 208, 0.58)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
    textWrap: 'pretty',
  },
  textureEmpty: {
    color: 'rgba(242, 232, 208, 0.5)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
    paddingBlock: 12,
    textWrap: 'pretty',
  },
  textureHeading: {
    color: 'rgba(242, 232, 208, 0.82)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: 0,
    width: 'fit-content',
  },
  textureHeadingRow: {
    alignItems: 'baseline',
    display: 'flex',
    gap: 8,
    minWidth: 0,
    paddingBottom: 8,
    paddingTop: 32,
    width: '100%',
  },
  textureHelpCopy: {
    margin: 0,
    whiteSpace: 'nowrap',
  },
  textureHelpPopup: {
    backgroundColor: '#12151c',
    borderRadius: 12,
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 16px 40px rgba(0, 0, 0, 0.32)',
    boxSizing: 'border-box',
    color: 'rgba(242, 232, 208, 0.72)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 13,
    gap: 8,
    lineHeight: 1.5,
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
  textureHelpPositioner: {
    zIndex: 200,
  },
  textureHelpTrigger: {
    appearance: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: {
      default: 'rgba(242, 232, 208, 0.42)',
      ':hover': 'rgba(242, 232, 208, 0.78)',
      ':focus-visible': 'rgba(242, 232, 208, 0.78)',
    },
    cursor: 'pointer',
    flexShrink: 0,
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    margin: 0,
    padding: 0,
    textDecoration: {
      default: 'none',
      ':focus-visible': 'underline',
    },
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': {
      outline: 'none',
    },
  },
  textureList: {
    display: 'flex',
    flexDirection: 'column',
    listStyle: 'none',
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
  textureName: {
    color: '#f2e8d0',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    margin: 0,
  },
  textureRow: {
    alignItems: 'stretch',
    columnGap: 30,
    display: 'grid',
    gridTemplateColumns: 'minmax(200px, 260px) minmax(0, 1fr)',
    gridTemplateRows: 'auto auto',
    listStyle: 'none',
    minWidth: 0,
    paddingBlock: 28,
    rowGap: 8,
    '@media (max-width: 960px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  textureStat: {
    alignItems: 'baseline',
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  textureThumb: {
    gridColumn: 1,
    gridRow: 1,
    aspectRatio: '2 / 1',
    backgroundColor: '#090c14',
    borderRadius: 10,
    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  textureThumbBadge: {
    backgroundColor: 'rgba(7, 8, 13, 0.72)',
    borderRadius: 999,
    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
    color: 'rgba(242, 232, 208, 0.78)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 9,
    fontWeight: 550,
    left: 6,
    letterSpacing: '0.02em',
    lineHeight: 1,
    paddingBlock: 4,
    paddingInline: 6,
    pointerEvents: 'none',
    position: 'absolute',
    top: 6,
  },
  textureThumbContain: {
    objectFit: 'contain',
  },
  textureThumbImage: {
    display: 'block',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    width: '100%',
  },
  textureSection: {
    gridColumn: '1 / -1',
    marginTop: 52,
    minWidth: 0,
  },
  textureStatLabel: {
    color: 'rgba(242, 232, 208, 0.28)',
    fontSize: 10,
    fontWeight: 550,
    lineHeight: 1.2,
    margin: 0,
  },
  textureStatNumber: {
    fontVariantNumeric: 'tabular-nums',
  },
  textureStatValue: {
    color: 'rgba(242, 232, 208, 0.52)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 10,
    fontWeight: 550,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    margin: 0,
  },
  textureStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 28,
    margin: 0,
    marginTop: 'auto',
    minWidth: 0,
    paddingTop: 12,
  },
  componentName: {
    backgroundColor: 'rgba(242, 232, 208, 0.065)',
    borderRadius: 999,
    color: 'rgba(242, 232, 208, 0.5)',
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: 10,
    paddingBlock: 6,
    paddingInline: 10,
    transform: 'translateY(-8px)',
  },
  content: {
    gridColumn: 2,
    minWidth: 0,
    paddingBlock: 0,
    paddingInline: 'clamp(24px, 4vw, 64px)',
    '@media (max-width: 960px)': {
      gridColumn: 'auto',
    },
  },
  copyIcon: {
    display: 'block',
    fill: 'none',
    height: 13,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.25,
    width: 13,
  },
  copyIconSwap: {
    display: 'inline-grid',
    height: 13,
    placeItems: 'center',
    width: 13,
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingBlock: 4,
    paddingInline: 0,
  },
  groupTitle: {
    alignItems: 'center',
    color: 'rgba(242, 232, 208, 0.66)',
    display: 'flex',
    fontSize: 13,
    fontWeight: 600,
    height: 36,
    lineHeight: 1,
    margin: 0,
    paddingInline: 0,
    textAlign: 'left',
    width: '100%',
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
  gridDock: {
    left: 16,
    position: 'fixed',
    top: 16,
    width: 'max-content',
    zIndex: 3,
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
  inspectorGroups: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingTop: 0,
  },
  eclipseIntroductionLighting: {
    textShadow: 'var(--eclipse-introduction-shadow)',
    transition: 'text-shadow 100ms cubic-bezier(0.23, 1, 0.32, 1)',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  eclipseNavigationLighting: {
    filter: 'var(--eclipse-navigation-filter)',
    transition: 'filter 100ms cubic-bezier(0.23, 1, 0.32, 1)',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  eclipseTitleLighting: {
    filter: 'var(--eclipse-introduction-filter)',
    textShadow: 'none',
    transition: 'filter 100ms cubic-bezier(0.23, 1, 0.32, 1)',
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
  numberFieldDigits: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'flex-end',
    minWidth: '1ch',
    position: 'relative',
  },
  numberFieldInput: {
    appearance: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: 'oklch(86.4% 0.003 84.6 / 0.84)',
    cursor: 'default',
    fieldSizing: 'content',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 500,
    height: 32,
    maxWidth: '7ch',
    minWidth: '1ch',
    padding: 0,
    textAlign: 'right',
    userSelect: 'none',
    width: 'auto',
    '::selection': {
      backgroundColor: 'transparent',
    },
    ':focus-visible': {
      color: 'oklch(96% 0.003 84.6)',
      outline: 'none',
    },
  },
  numberFieldInputActive: {
    color: 'oklch(96% 0.003 84.6)',
  },
  numberFieldInputGhost: {
    caretColor: 'transparent',
    color: 'transparent',
  },
  numberFieldMorph: {
    alignItems: 'center',
    color: 'oklch(86.4% 0.003 84.6 / 0.84)',
    display: 'flex',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 500,
    inset: 0,
    justifyContent: 'flex-end',
    lineHeight: 0.85,
    pointerEvents: 'none',
    position: 'absolute',
    userSelect: 'none',
    '--number-flow-mask-height': '0.1em',
    '--number-flow-mask-width': '0.25em',
  },
  numberFieldMorphActive: {
    color: 'oklch(96% 0.003 84.6)',
  },
  numberFieldRoot: {
    display: 'block',
    height: 48,
    paddingBlock: 4,
    paddingInline: 0,
  },
  numberFieldSuffix: {
    color: 'oklch(86.4% 0.003 84.6 / 0.42)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 11,
  },
  numberFieldSuffixActive: {
    color: 'oklch(96% 0.003 84.6 / 0.64)',
  },
  numberFieldValue: {
    alignItems: 'center',
    display: 'flex',
    gap: 0,
    height: 32,
    justifyContent: 'center',
    minWidth: 0,
    pointerEvents: 'auto',
    position: 'absolute',
    right: 10,
    top: 0,
    userSelect: 'none',
    zIndex: 3,
  },
  parameterGroup: {
    minWidth: 0,
  },
  presetCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: 'rgba(242, 232, 208, 0.48)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
    padding: 0,
    textAlign: 'left',
    width: 64,
    ':focus-visible': {
      outline: '1px solid color-mix(in oklch, var(--control-accent) 28%, transparent)',
      outlineOffset: 2,
    },
  },
  presetFrame: {
    backgroundColor: 'rgba(255, 255, 255, 0.028)',
    backgroundImage:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.012))',
    borderRadius: 12,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.04)',
    boxSizing: 'border-box',
    display: 'block',
    height: 64,
    overflow: 'hidden',
    padding: 8,
    position: 'relative',
    width: 64,
  },
  presetGrid: {
    display: 'grid',
    gap: 8,
    gridTemplateColumns: 'repeat(auto-fill, 64px)',
    paddingBlock: 4,
  },
  presetImage: {
    borderRadius: 4,
    display: 'block',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    pointerEvents: 'none',
    width: '100%',
  },
  presetLabel: {
    fontSize: 11,
    fontWeight: 550,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    overflow: 'hidden',
    paddingInline: 0,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  page: {
    '--showcase-inspector-width': '280px',
    '--showcase-picker-width': '300px',
    '--showcase-preview-top': 'round(calc(70px + clamp(24px, 4vh, 52px)), 8px)',
    '--showcase-title-size': 'clamp(36px, 4vw, 52px)',
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
      paddingBottom: 'calc(188px + env(safe-area-inset-bottom, 0px))',
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
  pickerAlsoAuthor: {
    color: 'rgba(242, 232, 208, 0.38)',
    fontSize: 10,
    lineHeight: 1.35,
  },
  pickerAlsoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  pickerAlsoLabel: {
    color: 'rgba(242, 232, 208, 0.38)',
    fontSize: 10,
    lineHeight: 1.45,
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
  pickerAlsoLink: {
    alignSelf: 'flex-end',
    color: {
      default: 'rgba(242, 232, 208, 0.62)',
      ':hover': 'rgba(242, 232, 208, 0.88)',
      ':focus-visible': '#ffffff',
    },
    position: 'relative',
  },
  pickerMeta: {
    alignSelf: 'flex-end',
    color: 'rgba(242, 232, 208, 0.38)',
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
      default: 'rgba(242, 232, 208, 0.82)',
      ':hover': '#f2e8d0',
      ':focus-visible': '#ffffff',
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
      default: 'rgba(242, 232, 208, 0.42)',
      ':hover': 'rgba(242, 232, 208, 0.76)',
      ':focus-visible': '#f2e8d0',
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
  planetTabSelected: {
    color: '#f2e8d0',
  },
  planetTabIndicator: {
    backgroundColor: '#f2e8d0',
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
  resetButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(in oklch 180deg, color-mix(in oklch, var(--control-accent) 90%, white) 0%, color-mix(in oklch, var(--control-accent) 94%, black) 100%)',
    borderRadius: 8,
    borderWidth: 0,
    boxShadow: {
      default: 'oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset',
      ':focus-visible':
        'oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset, 0 0 0 3px color-mix(in oklch, var(--control-accent) 22%, transparent)',
    },
    boxSizing: 'border-box',
    color: 'oklch(86.4% 0.003 84.6)',
    cursor: 'pointer',
    display: 'flex',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    fontSynthesis: 'none',
    gap: 6,
    justifyContent: 'center',
    lineHeight: '20px',
    marginTop: 16,
    overflowWrap: 'anywhere',
    paddingBlock: 8,
    paddingInline: 28,
    textAlign: 'center',
    width: '100%',
    ':focus-visible': {
      outline: 'none',
    },
  },
  resetButtonDisabled: {
    cursor: 'default',
    opacity: 0.45,
  },
  resetIcon: {
    fill: 'none',
    height: 12,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1,
    width: 12,
  },
  sliderControl: {
    inset: 0,
    opacity: 0,
    pointerEvents: 'none',
    position: 'absolute',
  },
  sliderIndicator: {
    backgroundColor: 'oklch(32.86% 0 0)',
    borderRadius: 8,
    boxSizing: 'content-box',
    boxShadow:
      '2px 0 3px oklch(0% 0 0 / 0.18), inset 0 1px 0 oklch(100% 0 0 / 0.035), inset 0 -1px 1px oklch(0% 0 0 / 0.13)',
    height: '100%',
    left: 0,
    paddingRight: 10,
    position: 'absolute',
    top: 0,
    transition: 'background-color 140ms ease-out, box-shadow 140ms ease-out',
  },
  sliderIndicatorActive: {
    backgroundImage:
      'linear-gradient(90deg, transparent, color-mix(in oklch, var(--control-accent) 12%, transparent)), linear-gradient(180deg, color-mix(in oklch, var(--control-accent) 90%, white) 0%, color-mix(in oklch, var(--control-accent) 96%, white) 45%, color-mix(in oklch, var(--control-accent) 99%, black) 100%)',
    boxShadow:
      'inset 0 1px 0 oklch(100% 0 0 / 0.12), inset 1px 0 0 oklch(100% 0 0 / 0.08), inset 0 -1px 1px oklch(0% 0 0 / 0.22), 0 3px 4px color-mix(in oklch, var(--control-accent) 16%, transparent), 0 1px 2px color-mix(in oklch, var(--control-accent) 8%, transparent)',
  },
  sliderIndicatorAtMaximum: {
    paddingRight: 0,
  },
  sliderLabel: {
    color: 'oklch(86.4% 0.003 84.6 / 0.78)',
    fontSize: 12,
    fontWeight: 500,
    left: 14,
    minWidth: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'absolute',
    textOverflow: 'ellipsis',
    top: '50%',
    transform: 'translateY(-50%)',
    whiteSpace: 'nowrap',
    zIndex: 2,
  },
  sliderRoot: {
    height: 32,
    minWidth: 0,
    position: 'relative',
    width: '100%',
  },
  sliderSemanticThumb: {
    height: 1,
    width: 1,
  },
  sliderSemanticTrack: {
    height: '100%',
    width: '100%',
  },
  sliderThumb: {
    backgroundColor: 'oklch(52.46% 0 0)',
    borderRadius: 2,
    boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 0.07), inset 0 -1px 1px oklch(0% 0 0 / 0.1)',
    height: 20,
    pointerEvents: 'none',
    position: 'absolute',
    top: 6,
    transition: 'box-shadow 140ms ease-out, transform 140ms ease-out',
    translate: '-50% 0',
    width: 4,
    zIndex: 2,
  },
  sliderThumbActive: {
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(180deg, oklch(100% 0 0) 0%, oklch(98.5% 0 0) 58%, oklch(95.6% 0 0) 100%)',
    boxShadow:
      '0 1px 1px color-mix(in oklch, var(--control-accent) 25%, transparent), 0 0 0 0.5px color-mix(in oklch, var(--control-accent) 65%, transparent), inset 0 1px 0 oklch(100% 0 0 / 0.78)',
  },
  sliderTrack: {
    backgroundColor: 'oklch(20.07% 0 0)',
    borderRadius: 8,
    boxShadow:
      '0 3px 7px oklch(0% 0 0 / 0.27), 0 1px 3px oklch(0% 0 0 / 0.2), inset 0 1px 0 oklch(100% 0 0 / 0.045), inset 0 -1px 1px oklch(0% 0 0 / 0.32), inset 1px 0 1px oklch(100% 0 0 / 0.025)',
    height: 32,
    overflow: 'hidden',
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    width: '100%',
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
  summary: {
    color: 'rgba(242, 232, 208, 0.42)',
    fontSize: 13,
    lineHeight: 1.65,
    marginBottom: 0,
    marginTop: 8,
    maxWidth: 560,
    minHeight: 'calc(1.65em * 2)',
  },
  switchLabel: {
    alignItems: 'center',
    backgroundColor: {
      default: 'oklch(100% 0 0 / 0.035)',
      ':hover': 'oklch(100% 0 0 / 0.055)',
    },
    borderRadius: 8,
    color: 'oklch(86.4% 0.003 84.6 / 0.72)',
    cursor: 'pointer',
    display: 'flex',
    fontSize: 13,
    fontWeight: 500,
    height: 40,
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 10,
    transition: 'background-color 140ms ease-out',
  },
  switchLabelCompact: {
    backgroundColor: {
      default: 'oklch(100% 0 0 / 0.04)',
      ':hover': 'oklch(100% 0 0 / 0.07)',
    },
    fontSize: 10,
    gap: 8,
    height: 28,
    justifyContent: 'flex-start',
    paddingLeft: 10,
    paddingRight: 6,
  },
  switchRoot: {
    backgroundColor: 'oklch(75.04% 0 0 / 0.32)',
    borderRadius: 999,
    borderWidth: 0,
    boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 0.12), 0 1px 2px oklch(0% 0 0 / 0.28)',
    cursor: 'pointer',
    display: 'block',
    flex: '0 0 auto',
    height: 18,
    position: 'relative',
    transition: 'background-color 300ms ease, box-shadow 300ms ease',
    width: 34,
    ':focus-visible': {
      boxShadow:
        'inset 0 1px 0 oklch(100% 0 0 / 0.12), 0 0 0 3px color-mix(in oklch, var(--control-accent) 22%, transparent)',
      outline: 'none',
    },
  },
  switchRootChecked: {
    backgroundColor: 'var(--control-accent)',
    boxShadow:
      'inset 0 1px 0 oklch(100% 0 0 / 0.18), 0 0 12px color-mix(in oklch, var(--control-accent) 30%, transparent)',
  },
  switchThumb: {
    backgroundColor: 'oklch(96% 0.004 84.6)',
    borderRadius: '50%',
    boxShadow: '0 2px 4px oklch(0% 0 0 / 0.28)',
    display: 'block',
    height: 14,
    left: 2,
    position: 'absolute',
    top: 2,
    transform: 'translateX(0)',
    transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    width: 14,
  },
  switchThumbChecked: {
    transform: 'translateX(16px)',
  },
  title: {
    backgroundClip: 'text',
    backgroundImage:
      'linear-gradient(180deg, color(display-p3 1 1 1) 0%, color(display-p3 0.8787 0.8708 0.8589) 100%)',
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
  wordmark: {
    alignItems: 'center',
    color: '#f2e8d0',
    display: 'flex',
    fontSize: 13,
    fontWeight: 620,
    gap: 9,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    textDecoration: 'none',
    ':focus-visible': {
      boxShadow: '0 2px 0 rgba(242,232,208,0.62)',
      color: '#ffffff',
      outline: 'none',
    },
  },
  wordmarkMark: {
    backgroundColor: '#f2e8d0',
    borderRadius: '50%',
    boxShadow: 'inset -3px -2px 0 rgba(16,17,18,0.52)',
    height: 11,
    width: 11,
  },
})
