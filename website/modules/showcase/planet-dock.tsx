'use client'

import { Drawer } from '@base-ui/react/drawer'
import { ScrollArea } from '@base-ui/react/scroll-area'
import * as stylex from '@stylexjs/stylex'
import { play } from 'cuelume'
import type { EmblaCarouselType } from 'embla-carousel'
import useEmblaCarousel from 'embla-carousel-react'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { hapticPress, hapticSettle, hapticTick } from './haptics'
import { tokens } from './tokens.stylex'
import { planets, type PlanetId } from './showcase-data'

// The dock is the settings drawer parked at its lowest snap point. The
// planet strip lives in the sheet header, so lifting the sheet morphs the
// pill into the drawer instead of swapping two surfaces.
const DOCK_HEIGHT = 56
const ITEM_SIZE = 44
const ITEM_GAP = 8
const TICKS_PER_STEP = 4
const TICKS_PER_LOOP = planets.length * TICKS_PER_STEP
// Strip edge band that the mask fades out; planets here count as out of view.
const EDGE_FADE = 40
const WHEEL_COOLDOWN_MS = 280
// The settings button shares the pill; spacing alone separates it from the strip.
const GEAR_SIZE = 44
const GEAR_INSET = (DOCK_HEIGHT - GEAR_SIZE) / 2
const GEAR_NUDGE = 8
const DOCK_GAP = 8
const GEAR_RESERVED = GEAR_SIZE + GEAR_INSET + GEAR_NUDGE + DOCK_GAP
const FLOAT_GAP = 12
// How far the fixed shell over-extends above the viewport. WebKit's cutoff is
// 1.05x; 50lvh leaves room for the visual viewport shrinking (toolbar expanded).
const EDGE_ESCAPE = '50lvh'
const PAGE_GUTTER = 'clamp(24px, 4vw, 64px)'
const SHEET_FILL = 'lab(5 0 0 / 0.95)'
const SHEET_BLUR = 'blur(22px) saturate(0.72)'
const DOCK_RADIUS = DOCK_HEIGHT / 2
const SHEET_RADIUS = 16
// Fade-out height where the settings body meets the planet row.
const BODY_FADE = 6
const SHEET_HEIGHT = '50dvh'
const PRESET_SNAP = 0.25
// Offset at the first snap (max 50dvh − first snap 25dvh); the pill → sheet morph
// completes over the travel from the dock to here.
const PRESET_TRAVEL = '25dvh'
const EXPANDED_NUDGE_PX = 48
const DRAG_SLOP = 6

type DockMode = 'dock' | 'preset' | 'expanded'

function clampIndex(index: number) {
  return Math.min(Math.max(index, 0), planets.length - 1)
}

function tickFromProgress(progress: number) {
  const cycle = ((progress % 1) + 1) % 1
  return Math.round(cycle * TICKS_PER_LOOP) % TICKS_PER_LOOP
}

function isSlideInView(api: EmblaCarouselType, index: number) {
  const viewport = api.rootNode().getBoundingClientRect()
  const slide = api.slideNodes()[index]?.getBoundingClientRect()
  if (!slide) return false
  const halfBand = viewport.width / 2 - ITEM_SIZE / 2 - EDGE_FADE
  const viewportCenter = viewport.left + viewport.width / 2
  return Math.abs(slide.left + slide.width / 2 - viewportCenter) <= halfBand
}

/**
 * Tap direction from the node's own box (loop clones included).
 * Anything left of the center slot scrolls one step left; right of it, one
 * step right. The centered planet itself does not move the strip.
 */
function tapScrollDirection(api: EmblaCarouselType, target: Element): 'next' | 'prev' | null {
  const viewport = api.rootNode().getBoundingClientRect()
  const box = target.getBoundingClientRect()
  const offset = box.left + box.width / 2 - (viewport.left + viewport.width / 2)
  if (offset <= -ITEM_SIZE / 2) return 'prev'
  if (offset >= ITEM_SIZE / 2) return 'next'
  return null
}

function playDetent(tick: number) {
  const major = ((tick % TICKS_PER_STEP) + TICKS_PER_STEP) % TICKS_PER_STEP === 0
  play('tick', { volume: major ? 0.48 : 0.22 })
  hapticTick(major)
}

function useExpandedSnapPoint(nudgePx: number): Drawer.Root.SnapPoint {
  const [snap, setSnap] = useState<Drawer.Root.SnapPoint>(0.5)

  useEffect(() => {
    const read = () => {
      const height = window.visualViewport?.height ?? window.innerHeight
      setSnap(`${Math.max(0, Math.round(height * 0.5 - nudgePx))}px`)
    }
    read()
    window.addEventListener('resize', read)
    window.visualViewport?.addEventListener('resize', read)
    return () => {
      window.removeEventListener('resize', read)
      window.visualViewport?.removeEventListener('resize', read)
    }
  }, [nudgePx])

  return snap
}

// env() is not readable from JS; measure a probe sized by the inset. The
// probe lives in the portal, so it is tracked as state rather than a ref.
function useSafeAreaBottom(probe: HTMLDivElement | null) {
  const [inset, setInset] = useState(0)

  useLayoutEffect(() => {
    if (!probe) return
    const read = () => setInset(Math.round(probe.offsetHeight))
    read()
    const observer = new ResizeObserver(read)
    observer.observe(probe)
    return () => observer.disconnect()
  }, [probe])

  return inset
}

function SlidersIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" {...stylex.props(styles.gearIcon)}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
        <path d="M3 6h12" />
        <path d="M3 12h12" />
      </g>
      <circle cx="11.5" cy="6" fill="currentColor" r="2" />
      <circle cx="6.5" cy="12" fill="currentColor" r="2" />
    </svg>
  )
}

function DockPlanet({ index, selected }: { index: number; selected: boolean }) {
  const planet = planets[index]

  return (
    <button
      aria-current={selected ? 'true' : undefined}
      aria-label={planet.name}
      data-planet-index={index}
      type="button"
      {...stylex.props(styles.planet, selected && styles.planetSelected)}
    >
      <img
        alt=""
        draggable={false}
        height={160}
        src={`/thumbnails/v1/${planet.id}.avif`}
        width={160}
        {...stylex.props(styles.planetImage, selected && styles.planetImageSelected)}
        style={planet.id === 'saturn' ? { transform: 'scale(1.2)' } : undefined}
      />
    </button>
  )
}

function PlanetStrip({
  children,
  onSelectPlanet,
  reducedMotion,
  selectedPlanet,
}: {
  children?: ReactNode
  onSelectPlanet: (id: PlanetId) => void
  reducedMotion: boolean
  selectedPlanet: PlanetId
}) {
  const selectedIndex = clampIndex(planets.findIndex((planet) => planet.id === selectedPlanet))
  const startIndexRef = useRef(selectedIndex)
  const emblaOptions = useMemo(
    () => ({
      align: 'center' as const,
      containScroll: false as const,
      duration: reducedMotion ? 0 : 25,
      loop: true,
      skipSnaps: true,
      startIndex: startIndexRef.current,
      // Taps highlight in place; don't let focus steal the scroll position.
      watchFocus: false,
    }),
    [reducedMotion],
  )
  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions)
  const armedRef = useRef(false)
  const lastTickRef = useRef(tickFromProgress(selectedIndex / planets.length))
  const selfDrivenRef = useRef(false)
  const ignoreClickRef = useRef(false)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const selectedRef = useRef(selectedPlanet)
  const onSelectPlanetRef = useRef(onSelectPlanet)

  useEffect(() => {
    selectedRef.current = selectedPlanet
    onSelectPlanetRef.current = onSelectPlanet
  }, [onSelectPlanet, selectedPlanet])

  function armSound(api: EmblaCarouselType | undefined = emblaApi) {
    if (armedRef.current) return
    armedRef.current = true
    lastTickRef.current = tickFromProgress(api?.scrollProgress() ?? 0)
  }

  function commitSelection(id: PlanetId) {
    if (id === selectedRef.current) return
    selfDrivenRef.current = true
    play('toggle', { volume: 0.4 })
    hapticSettle()
    onSelectPlanetRef.current(id)
  }

  // Route changes only scroll when the selected planet is out of view; the
  // strip otherwise stays where the user left it. Taps never scroll.
  useLayoutEffect(() => {
    if (!emblaApi) return
    if (selfDrivenRef.current) {
      selfDrivenRef.current = false
      return
    }
    if (isSlideInView(emblaApi, selectedIndex)) return
    emblaApi.scrollTo(selectedIndex, reducedMotion)
  }, [emblaApi, reducedMotion, selectedIndex])

  useEffect(() => {
    if (!emblaApi) return

    const onScroll = () => {
      if (!armedRef.current) return
      const tick = tickFromProgress(emblaApi.scrollProgress())
      if (tick === lastTickRef.current) return
      lastTickRef.current = tick
      playDetent(tick)
    }

    let wheelLock = 0
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (Math.abs(delta) < 8) return
      event.preventDefault()
      const now = performance.now()
      if (now < wheelLock) return
      wheelLock = now + WHEEL_COOLDOWN_MS
      armSound(emblaApi)
      if (delta > 0) emblaApi.scrollNext(reducedMotion)
      else emblaApi.scrollPrev(reducedMotion)
    }

    const viewport = emblaApi.rootNode()
    emblaApi.on('scroll', onScroll)
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      emblaApi.off('scroll', onScroll)
      viewport.removeEventListener('wheel', onWheel)
    }
  }, [emblaApi, reducedMotion])

  function onStripClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false
      return
    }
    if (!emblaApi) return
    const target = (event.target as Element | null)?.closest('[data-planet-index]')
    if (!target || !emblaApi.containerNode().contains(target)) return
    const index = Number(target.getAttribute('data-planet-index'))
    if (!Number.isInteger(index) || index < 0 || index >= planets.length) return
    armSound()
    const direction = tapScrollDirection(emblaApi, target)
    if (direction === 'prev') {
      selfDrivenRef.current = true
      emblaApi.scrollPrev(reducedMotion)
    } else if (direction === 'next') {
      selfDrivenRef.current = true
      emblaApi.scrollNext(reducedMotion)
    }
    commitSelection(planets[index].id)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    dragRef.current = { x: event.clientX, y: event.clientY }
    ignoreClickRef.current = false
    armSound()
    play('press', { volume: 0.3 })
    hapticPress()
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= DRAG_SLOP) {
      ignoreClickRef.current = true
      dragRef.current = null
    }
  }

  function onPointerUp() {
    dragRef.current = null
  }

  return (
    <div {...stylex.props(styles.dockRow)}>
      <div {...stylex.props(styles.stripMask)}>
        <div
          ref={emblaRef}
          aria-label="Celestial objects"
          onClick={onStripClick}
          onPointerCancel={onPointerUp}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          {...stylex.props(styles.strip)}
        >
          <div {...stylex.props(styles.stripTrack)}>
            {planets.map((planet, index) => (
              <DockPlanet index={index} key={planet.id} selected={planet.id === selectedPlanet} />
            ))}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

export function PlanetDock({
  children,
  onSelectPlanet,
  reducedMotion,
  selectedPlanet,
}: {
  children: ReactNode
  onSelectPlanet: (id: PlanetId) => void
  reducedMotion: boolean
  selectedPlanet: PlanetId
}) {
  const [mode, setMode] = useState<DockMode>('dock')
  const [probe, setProbe] = useState<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  // Base UI writes `--drawer-snap-point-offset: 0px` until it has measured the
  // popup and viewport, which paints the full sheet for a frame and then
  // animates it *down* into the dock. Hold the popup below the viewport until
  // the offset is real, then let the normal transition slide it up.
  const [placed, setPlaced] = useState(false)

  useEffect(() => {
    if (placed) return
    let frame = 0
    const check = () => {
      const popup = popupRef.current
      const offset = popup
        ? Number.parseFloat(getComputedStyle(popup).getPropertyValue('--drawer-snap-point-offset'))
        : 0
      if (offset > 0) {
        setPlaced(true)
        return
      }
      frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    return () => cancelAnimationFrame(frame)
  }, [placed])
  const safeBottom = useSafeAreaBottom(probe)
  const dockSnap: Drawer.Root.SnapPoint = `${DOCK_HEIGHT + FLOAT_GAP + safeBottom}px`
  const expandedSnap = useExpandedSnapPoint(EXPANDED_NUDGE_PX)
  const snapPoint = mode === 'dock' ? dockSnap : mode === 'preset' ? PRESET_SNAP : expandedSnap

  function modeFromSnapPoint(next: Drawer.Root.SnapPoint): DockMode {
    if (next === PRESET_SNAP) return 'preset'
    if (next === expandedSnap) return 'expanded'
    return 'dock'
  }

  function changeMode(nextMode: DockMode) {
    if (nextMode === mode) return
    play('toggle', { volume: 0.32 })
    hapticSettle()
    setMode(nextMode)
  }

  return (
    <Drawer.Root
      disablePointerDismissal
      modal={false}
      onOpenChange={(next, details) => {
        // The dock is the closed state; never let a swipe past it unmount the sheet.
        if (!next) details.cancel()
      }}
      onSnapPointChange={(next) => {
        if (next != null) changeMode(modeFromSnapPoint(next))
      }}
      open
      snapPoint={snapPoint}
      snapPoints={[dockSnap, PRESET_SNAP, expandedSnap]}
      snapToSequentialPoints
      swipeDirection="down"
    >
      <Drawer.Portal>
        {/*
          The only `position: fixed` box in the dock. iOS 26 Safari hit-tests a
          point 4px inside the bottom edge, walks up to the nearest fixed/sticky
          ancestor and, if it finds one, paints a solid "colour extension" strip
          under its glass toolbar instead of the page (WebKit
          `LocalFrameView::fixedContainerEdges`). That strip is the black band
          that stopped the canvas from filling the bar. A fixed box that is more
          than 1.05x the viewport height is classified `TooLarge` and skipped, so
          this shell over-extends upward and the walk ends with no container.
          Everything inside is `absolute`, which the walk ignores.
        */}
        <div {...stylex.props(styles.fixedShell)}>
          <Drawer.Viewport
            style={{ '--dock-snap': dockSnap } as CSSProperties}
            {...stylex.props(styles.viewport)}
          >
            <div ref={setProbe} aria-hidden="true" {...stylex.props(styles.safeAreaProbe)} />
            <Drawer.Popup
              ref={popupRef}
              initialFocus={false}
              {...stylex.props(styles.popup, !placed && styles.popupPending)}
            >
              <div data-sky-ink-opaque="" {...stylex.props(styles.sheetSurface)}>
                <div
                  aria-hidden="true"
                  {...stylex.props(
                    styles.sheetBackdrop,
                    selectedPlanet === 'sky' && styles.sheetBackdropFlat,
                  )}
                />
                <div {...stylex.props(styles.sheetClip)}>
                  {/*
                    The sheet grows upward from the pill: handle and settings
                    body stack above the planet row, which keeps the pill's
                    exact position, width and controls in every state.
                  */}
                  <div aria-hidden="true" {...stylex.props(styles.sheetHandle)} />
                  <Drawer.Title {...stylex.props(styles.visuallyHidden)}>Settings</Drawer.Title>
                  <Drawer.Content {...stylex.props(styles.sheetBody)}>
                    <ScrollArea.Root {...stylex.props(styles.sheetScroll)}>
                      <ScrollArea.Viewport {...stylex.props(styles.sheetScrollViewport)}>
                        <ScrollArea.Content {...stylex.props(styles.sheetScrollContent)}>
                          {children}
                        </ScrollArea.Content>
                      </ScrollArea.Viewport>
                      <ScrollArea.Scrollbar
                        keepMounted
                        orientation="vertical"
                        {...stylex.props(styles.sheetScrollbar)}
                      >
                        <ScrollArea.Thumb {...stylex.props(styles.sheetScrollbarThumb)} />
                      </ScrollArea.Scrollbar>
                    </ScrollArea.Root>
                  </Drawer.Content>
                  <PlanetStrip
                    onSelectPlanet={onSelectPlanet}
                    reducedMotion={reducedMotion}
                    selectedPlanet={selectedPlanet}
                  >
                    <button
                      aria-expanded={mode !== 'dock'}
                      aria-label={mode === 'dock' ? 'Open settings' : 'Close settings'}
                      onClick={() => changeMode(mode === 'dock' ? 'preset' : 'dock')}
                      type="button"
                      {...stylex.props(styles.gear)}
                    >
                      <SlidersIcon />
                    </button>
                  </PlanetStrip>
                </div>
                <div aria-hidden="true" {...stylex.props(styles.sheetBottomMask)} />
              </div>
            </Drawer.Popup>
          </Drawer.Viewport>
        </div>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

const styles = stylex.create({
  dockRow: {
    flex: '0 0 auto',
    height: DOCK_HEIGHT,
    position: 'relative',
  },
  gear: {
    alignItems: 'center',
    appearance: 'none',
    backgroundColor: 'transparent',
    borderRadius: '50%',
    borderWidth: 0,
    boxShadow: {
      default: 'none',
      ':focus-visible': `0 0 0 3px color-mix(in oklch, ${tokens.controlAccent} 22%, transparent)`,
    },
    color: {
      default: 'rgba(242, 232, 208, 0.72)',
      ':hover': '#f2e8d0',
      ':focus-visible': '#f2e8d0',
    },
    cursor: 'pointer',
    display: 'grid',
    height: GEAR_SIZE,
    padding: 0,
    placeItems: 'center',
    pointerEvents: 'auto',
    position: 'absolute',
    right: GEAR_INSET + GEAR_NUDGE,
    top: GEAR_INSET,
    transitionDuration: '180ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    width: GEAR_SIZE,
    zIndex: 2,
    ':focus-visible': {
      outline: 'none',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  gearIcon: {
    display: 'block',
    height: 18,
    width: 18,
  },
  planet: {
    alignItems: 'center',
    appearance: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    cursor: 'pointer',
    display: 'flex',
    flex: '0 0 auto',
    height: ITEM_SIZE,
    justifyContent: 'center',
    opacity: 0.42,
    padding: 0,
    transitionDuration: '180ms',
    transitionProperty: 'opacity',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    WebkitTouchCallout: 'none',
    width: ITEM_SIZE,
    ':focus-visible': {
      borderRadius: '50%',
      outline: '2px solid #f2e8d0',
      outlineOffset: 2,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  planetSelected: {
    opacity: 1,
  },
  planetImage: {
    display: 'block',
    height: 32,
    objectFit: 'contain',
    pointerEvents: 'none',
    transitionDuration: '180ms',
    transitionProperty: 'height, width',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    userSelect: 'none',
    WebkitTouchCallout: 'none',
    WebkitUserDrag: 'none',
    width: 32,
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  planetImageSelected: {
    height: 36,
    width: 36,
  },
  // Progress vars resolve here, where Drawer writes its travel vars, and
  // inherit down as plain numbers so children do not need `inherit` hacks.
  //
  // The popup is not translated by the snap offset. It stays pinned to the
  // viewport bottom and consumes the offset as `padding-top`, so the surface
  // grows in place and the planet row never moves. Splitting the offset
  // between a compositor `transform` and a main-thread padding transition
  // let the two run on different clocks and the row visibly jumped at the
  // start of every snap.
  popup: {
    // The dock is the floor. Base UI lets a downward swipe keep moving past
    // the lowest snap point (it only reverts on release), so clamp the travel
    // here and the pill never leaves its resting spot.
    '--sheet-travel': `min(calc(var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y)), calc(${SHEET_HEIGHT} - var(--dock-snap)))`,
    '--dock-lift': `calc(${SHEET_HEIGHT} - var(--dock-snap) - var(--sheet-travel))`,
    '--dock-progress': `clamp(0, var(--dock-lift) / (${PRESET_TRAVEL} - var(--dock-snap)), 1)`,
    '--float-bottom': `calc(${FLOAT_GAP}px + env(safe-area-inset-bottom, 0px))`,
    backgroundColor: 'transparent',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    height: SHEET_HEIGHT,
    maxHeight: SHEET_HEIGHT,
    minHeight: 0,
    outline: 'none',
    overflow: 'visible',
    paddingTop: 'max(0px, var(--sheet-travel))',
    // The padded area above the surface is empty; let taps reach the page.
    pointerEvents: 'none',
    position: 'relative',
    transform: 'none',
    transitionDuration: '450ms',
    transitionProperty: 'transform, padding-top',
    transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
    width: '100%',
    ':is([data-swiping])': {
      transitionDuration: '0ms',
    },
    // Entrance only: slide the whole popup; padding stays at rest. There is
    // deliberately no `[data-ending-style]` rule: the drawer never closes (the
    // dock is its closed state), but a fast flick down at the dock still makes
    // Base UI flag an ending style for a frame before the cancelled dismiss is
    // reverted, and an exit transform there would visibly yank the pill away.
    ':is([data-starting-style])': {
      transform: 'translateY(100%)',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  // Before the snap offset is measured: parked off-screen, no transition, and
  // already in pill geometry so the entrance is a plain slide up.
  popupPending: {
    '--dock-progress': '0',
    transform: 'translateY(100%)',
    transitionDuration: '0ms',
  },
  safeAreaProbe: {
    height: 'env(safe-area-inset-bottom, 0px)',
    pointerEvents: 'none',
    position: 'absolute',
    visibility: 'hidden',
    width: 1,
  },
  sheetBody: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
    opacity: 'var(--dock-progress)',
    overflow: 'hidden',
    touchAction: 'auto',
    transitionDuration: 'inherit',
    transitionProperty: 'opacity',
    transitionTimingFunction: 'inherit',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  sheetBottomMask: {
    backgroundImage:
      'linear-gradient(in oklch to bottom, transparent 0%, lab(5 0 0 / 0.22) 38%, lab(5 0 0 / 0.08) 68%, transparent 100%)',
    bottom: `calc(-1 * (84px + ${FLOAT_GAP}px) * var(--dock-progress))`,
    height: `calc((96px + ${FLOAT_GAP}px) * var(--dock-progress))`,
    left: 0,
    opacity: 'var(--dock-progress)',
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    transitionDuration: 'inherit',
    transitionProperty: 'opacity, height, bottom',
    transitionTimingFunction: 'inherit',
    zIndex: 2,
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  sheetHandle: {
    alignItems: 'center',
    display: 'flex',
    flexShrink: 0,
    height: 'calc(22px * var(--dock-progress))',
    justifyContent: 'center',
    opacity: 'var(--dock-progress)',
    overflow: 'hidden',
    pointerEvents: 'none',
    transitionDuration: 'inherit',
    transitionProperty: 'height, opacity',
    transitionTimingFunction: 'inherit',
    '::after': {
      backgroundColor: 'rgba(242, 232, 208, 0.22)',
      borderRadius: 2,
      content: '""',
      height: 3,
      width: 36,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  sheetClip: {
    borderRadius: 'inherit',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
    // Relay the popup's timing to the handle and body, which use `inherit`;
    // without this link they resolved to 0s and snapped into view.
    transitionDuration: 'inherit',
    transitionProperty: 'none',
    transitionTimingFunction: 'inherit',
    zIndex: 1,
  },
  sheetScroll: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  sheetScrollContent: {
    // Room to scroll the last control clear of the fade above the planet row.
    paddingBottom: BODY_FADE,
    paddingInline: 20,
    paddingTop: 4,
  },
  sheetScrollViewport: {
    flex: 1,
    // Settings dissolve into the planet row instead of being cut at its edge.
    maskImage: `linear-gradient(to bottom, black calc(100% - ${BODY_FADE}px), transparent 100%)`,
    minHeight: 0,
    overflowX: 'hidden',
    overflowY: 'scroll',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
  },
  sheetScrollbar: {
    bottom: 8,
    display: 'flex',
    justifyContent: 'center',
    opacity: 1,
    pointerEvents: 'auto',
    position: 'absolute',
    right: 4,
    top: 8,
    width: 3,
  },
  sheetScrollbarThumb: {
    backgroundColor: 'oklch(86.4% 0.003 84.6 / 0.42)',
    borderRadius: 999,
    flex: 1,
    minHeight: 24,
    width: '100%',
  },
  // Parked: a floating pill. Lifting stretches it upward into the sheet; the
  // bottom gap and side inset stay, and all four corners morph 28px → 16px.
  sheetBackdrop: {
    backdropFilter: SHEET_BLUR,
    backgroundColor: SHEET_FILL,
    borderRadius: 'inherit',
    boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 0.102), inset 0 0 0 1px oklch(100% 0 0 / 0.039)',
    inset: 0,
    pointerEvents: 'none',
    position: 'absolute',
  },
  // The Sky canvas fills the viewport and repaints every frame, so a backdrop
  // blur over it is re-evaluated every frame on the GPU. Trade it for a denser
  // fill on that page only.
  sheetBackdropFlat: {
    backdropFilter: 'none',
    backgroundColor: SHEET_FILL,
  },
  sheetSurface: {
    // The sheet is always a dark surface, so labels inside it keep the cream
    // ink regardless of what the Sky canvas is doing behind it.
    '--showcase-label-ink': 'rgba(242, 232, 208, 0.66)',
    backgroundColor: 'transparent',
    // Bottom corners belong to the pill and stay; the top ones morph as the
    // sheet rises out of it.
    borderBottomLeftRadius: DOCK_RADIUS,
    borderBottomRightRadius: DOCK_RADIUS,
    borderTopLeftRadius: `calc(${DOCK_RADIUS}px - ${DOCK_RADIUS - SHEET_RADIUS}px * var(--dock-progress))`,
    borderTopRightRadius: `calc(${DOCK_RADIUS}px - ${DOCK_RADIUS - SHEET_RADIUS}px * var(--dock-progress))`,
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    // Same inset as the pill in every state, so the planet row is untouched.
    marginBottom: 'var(--float-bottom)',
    marginInline: PAGE_GUTTER,
    minHeight: 0,
    overflow: 'visible',
    pointerEvents: 'auto',
    position: 'relative',
    transitionDuration: 'inherit',
    transitionProperty: 'border-radius',
    transitionTimingFunction: 'inherit',
    zIndex: 1,
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  strip: {
    height: '100%',
    maskImage:
      'linear-gradient(to right, transparent 0%, rgb(0 0 0 / 0.12) 16px, rgb(0 0 0 / 0.4) 40px, rgb(0 0 0 / 0.78) 72px, black 104px, black calc(100% - 104px), rgb(0 0 0 / 0.78) calc(100% - 72px), rgb(0 0 0 / 0.4) calc(100% - 40px), rgb(0 0 0 / 0.12) calc(100% - 16px), transparent 100%)',
    overflow: 'hidden',
    touchAction: 'pan-x',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  stripTrack: {
    alignItems: 'center',
    display: 'flex',
    gap: ITEM_GAP,
    height: '100%',
    touchAction: 'pan-x',
  },
  stripMask: {
    flex: '1 1 auto',
    height: '100%',
    // Room for the settings button; the row never changes shape.
    marginRight: GEAR_RESERVED,
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  // See the JSX comment: must stay > 1.05x the viewport height, transparent
  // (no background, no backdrop-filter) and the only fixed box in the dock.
  fixedShell: {
    height: `calc(var(--visual-viewport-height, 100dvh) + ${EDGE_ESCAPE})`,
    left: 0,
    pointerEvents: 'none',
    position: 'fixed',
    right: 0,
    top: `calc(var(--visual-viewport-offset-top, 0px) - ${EDGE_ESCAPE})`,
    zIndex: 24,
  },
  // Sized to the visual viewport (Base UI resolves fractional snap points
  // against its offsetHeight), pinned to the shell's bottom edge.
  viewport: {
    alignItems: 'flex-end',
    bottom: 0,
    display: 'flex',
    height: 'var(--visual-viewport-height, 100dvh)',
    justifyContent: 'center',
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    touchAction: 'none',
  },
  visuallyHidden: {
    borderWidth: 0,
    clip: 'rect(0 0 0 0)',
    height: 1,
    margin: -1,
    overflow: 'hidden',
    padding: 0,
    position: 'absolute',
    width: 1,
  },
})
