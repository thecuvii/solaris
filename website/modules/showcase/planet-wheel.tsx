'use client'

import { Drawer } from '@base-ui/react/drawer'
import { ScrollArea } from '@base-ui/react/scroll-area'
import * as stylex from '@stylexjs/stylex'
import { play } from 'cuelume'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { hapticPress, hapticSettle, hapticTick } from './haptics'
import { planets, type PlanetId } from './showcase-data'

// Pack tighter than a full ring. The unused arc sits opposite the
// selection and stays off-screen under the dock.
const STEP = 18
const WHEEL_RADIUS = 240
const WHEEL_SIZE = WHEEL_RADIUS * 2
const RING = 56
const RADIUS = WHEEL_RADIUS - RING / 2 + 4
const ORBIT_TOP = WHEEL_RADIUS - 4
const DRAG_DEG_PER_PX = 0.48
const OPEN_PULL = 36
const MAX_COAST_STEPS = 6
const VELOCITY_WINDOW_MS = 90
const COAST_POWER = 0.8
const COAST_TIME_CONSTANT = 220
const COAST_COMMIT = 12
const SNAP_SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 } as const
const PRESET_SNAP = 0.25
const EXPANDED_NUDGE_PX = 48
// Offset at the flush snap (max 50dvh − first snap 25dvh). Morph finishes 5dvh later (0.30).
const PRESET_TRAVEL = '25dvh'
const MORPH_RANGE = '5dvh'
const FLOAT_GAP = '12px'
const SHEET_RADIUS = '16px'
const SHEET_PROGRESS = `clamp(0, (${PRESET_TRAVEL} - (var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y))) / ${MORPH_RANGE}, 1)`

function wrapIndex(index: number) {
  const count = planets.length
  return ((index % count) + count) % count
}

function nearestIndex(rotation: number) {
  return wrapIndex(Math.round(rotation / STEP))
}

function shortestIndexDelta(from: number, to: number) {
  const count = planets.length
  let delta = to - from
  delta -= count * Math.round(delta / count)
  return delta
}

function shortestDelta(from: number, to: number) {
  return shortestIndexDelta(from / STEP, to / STEP) * STEP
}

function snapCoastTarget(projected: number, origin: number, velocity: number) {
  let target = Math.round(projected / STEP) * STEP
  // A live flick must settle ahead of the hand. Rounding the ballistic
  // rest can pick the detent behind, which reads as a yank at the end.
  if (velocity > COAST_COMMIT && target < origin) target += STEP
  else if (velocity < -COAST_COMMIT && target > origin) target -= STEP
  const maxTravel = STEP * MAX_COAST_STEPS
  target = Math.min(Math.max(target, origin - maxTravel), origin + maxTravel)
  return Math.round(target / STEP) * STEP
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

function ChevronUpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.gearIcon)}>
      <path d="M3.5 10.25 8 5.75l4.5 4.5" />
    </svg>
  )
}

const TICKS_PER_STEP = 4
const TICK_STEP = STEP / TICKS_PER_STEP
const VISUAL_TICKS_PER_STEP = 8
const VISUAL_TICK_STEP = STEP / VISUAL_TICKS_PER_STEP
// Ticks sit on the inner edge of the outer ring.
const TICK_INNER = WHEEL_RADIUS - RING + 1
const TICK_CENTER_OUTER = TICK_INNER + 6
const TICK_COUNT = Math.round(360 / VISUAL_TICK_STEP)
const TICK_MARKS = Array.from({ length: TICK_COUNT }, (_, index) => {
  const slot = index % VISUAL_TICKS_PER_STEP
  const kind = slot === 0 ? 'major' : slot === 4 ? 'mid' : 'minor'
  const angle = ((index * VISUAL_TICK_STEP - 90) * Math.PI) / 180
  const outer =
    kind === 'major' ? TICK_INNER + 6 : kind === 'mid' ? TICK_INNER + 4.5 : TICK_INNER + 3
  return {
    kind,
    x1: WHEEL_RADIUS + Math.cos(angle) * TICK_INNER,
    x2: WHEEL_RADIUS + Math.cos(angle) * outer,
    y1: WHEEL_RADIUS + Math.sin(angle) * TICK_INNER,
    y2: WHEEL_RADIUS + Math.sin(angle) * outer,
  }
})
const TICK_CENTER = {
  x1: WHEEL_RADIUS,
  x2: WHEEL_RADIUS,
  y1: WHEEL_RADIUS - TICK_INNER,
  y2: WHEEL_RADIUS - TICK_CENTER_OUTER,
}

function tickIndex(rotation: number) {
  return Math.round(rotation / TICK_STEP)
}

function playDetent(rotation: number) {
  const major = ((tickIndex(rotation) % TICKS_PER_STEP) + TICKS_PER_STEP) % TICKS_PER_STEP === 0
  play('tick', { volume: major ? 0.48 : 0.22 })
  hapticTick(major)
}

function planetIndexFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const node = target.closest('[data-planet-index]')
  if (!node) return null
  const index = Number(node.getAttribute('data-planet-index'))
  return Number.isInteger(index) ? index : null
}

function WheelTicks({ rotation }: { rotation: ReturnType<typeof useMotionValue<number>> }) {
  const rotate = useTransform(rotation, (value) => -value)

  return (
    <>
      <motion.svg
        aria-hidden="true"
        style={{ rotate }}
        viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
        {...stylex.props(styles.ticks)}
      >
        {TICK_MARKS.map((mark, index) => (
          <line
            key={`tick-${index}`}
            stroke={
              mark.kind === 'major'
                ? 'color-mix(in oklch, var(--control-accent) 78%, white)'
                : mark.kind === 'mid'
                  ? 'color-mix(in oklch, var(--control-accent) 88%, white)'
                  : 'color-mix(in oklch, var(--control-accent) 92%, white)'
            }
            strokeLinecap="round"
            strokeWidth={mark.kind === 'major' ? 1.15 : mark.kind === 'mid' ? 0.75 : 0.5}
            x1={mark.x1}
            x2={mark.x2}
            y1={mark.y1}
            y2={mark.y2}
          />
        ))}
      </motion.svg>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
        {...stylex.props(styles.ticks)}
      >
        <line
          stroke="color-mix(in oklch, var(--control-accent) 58%, white)"
          strokeLinecap="round"
          strokeWidth={1.15}
          x1={TICK_CENTER.x1}
          x2={TICK_CENTER.x2}
          y1={TICK_CENTER.y1}
          y2={TICK_CENTER.y2}
        />
      </svg>
    </>
  )
}

function WheelPlanet({
  index,
  onSelect,
  rotation,
  selected,
}: {
  index: number
  onSelect: (id: PlanetId) => void
  rotation: ReturnType<typeof useMotionValue<number>>
  selected: boolean
}) {
  const planet = planets[index]
  const x = useTransform(rotation, (value) => {
    const angle = ((shortestIndexDelta(value / STEP, index) * STEP - 90) * Math.PI) / 180
    return Math.cos(angle) * RADIUS
  })
  const y = useTransform(rotation, (value) => {
    const angle = ((shortestIndexDelta(value / STEP, index) * STEP - 90) * Math.PI) / 180
    return Math.sin(angle) * RADIUS
  })
  const scale = useTransform(rotation, (value) => {
    const delta = Math.abs(shortestDelta(value, index * STEP))
    return 0.78 + Math.max(0, 1 - delta / STEP) * 0.34
  })
  const opacity = useTransform(rotation, (value) => {
    const delta = Math.abs(shortestDelta(value, index * STEP))
    return 0.28 + Math.max(0, 1 - delta / (STEP * 2.2)) * 0.72
  })

  return (
    <motion.button
      aria-current={selected ? 'true' : undefined}
      aria-label={planet.name}
      data-planet-index={index}
      onClick={() => onSelect(planet.id)}
      style={{ opacity, scale, x, y }}
      type="button"
      {...stylex.props(styles.planet, selected && styles.planetActive)}
    >
      <img
        alt=""
        draggable={false}
        height={160}
        src={`/thumbnails/v1/${planet.id}.avif`}
        width={160}
        {...stylex.props(styles.planetImage)}
        style={planet.id === 'saturn' ? { transform: 'scale(1.2)' } : undefined}
      />
    </motion.button>
  )
}

export function PlanetWheel({
  onSelectPlanet,
  onSettingsOpenChange,
  reducedMotion,
  selectedPlanet,
  settingsOpen,
}: {
  onSelectPlanet: (id: PlanetId) => void
  onSettingsOpenChange: (open: boolean) => void
  reducedMotion: boolean
  selectedPlanet: PlanetId
  settingsOpen: boolean
}) {
  const selectedIndex = Math.max(
    0,
    planets.findIndex((planet) => planet.id === selectedPlanet),
  )
  const rotation = useMotionValue(selectedIndex * STEP)
  const dragRef = useRef<{
    moved: boolean
    planetIndex: number | null
    pointerId: number
    pulled: boolean
    samples: { t: number; x: number }[]
    startRotation: number
    startX: number
    startY: number
  } | null>(null)
  const suppressGearClickRef = useRef(false)
  const ignorePlanetClickRef = useRef(false)
  const lastTickRef = useRef(tickIndex(selectedIndex * STEP))
  const armedRef = useRef(false)
  const selfDrivenRef = useRef(false)
  const spinIdRef = useRef(0)
  const spinRef = useRef<{ stop: () => void } | null>(null)

  function armSound() {
    if (armedRef.current) return
    armedRef.current = true
    lastTickRef.current = tickIndex(rotation.get())
  }

  function stopSpin() {
    spinIdRef.current += 1
    spinRef.current?.stop()
    spinRef.current = null
  }

  useEffect(() => {
    return rotation.on('change', (value) => {
      if (!armedRef.current) return
      const next = tickIndex(value)
      if (next === lastTickRef.current) return
      lastTickRef.current = next
      playDetent(value)
    })
  }, [rotation])

  useEffect(() => {
    if (selfDrivenRef.current) {
      selfDrivenRef.current = false
      return
    }
    const target = selectedIndex * STEP
    const current = rotation.get()
    const next = current + shortestDelta(current, target)
    if (reducedMotion) {
      rotation.set(next)
      return
    }
    stopSpin()
    spinRef.current = animate(rotation, next, SNAP_SPRING)
  }, [reducedMotion, rotation, selectedIndex])

  function selectPlanet(id: PlanetId) {
    armSound()
    selfDrivenRef.current = true
    play('toggle', { volume: 0.4 })
    hapticSettle()
    onSelectPlanet(id)
  }

  function snapTo(index: number) {
    const current = rotation.get()
    const target = current + shortestDelta(current, wrapIndex(index) * STEP)
    stopSpin()
    if (reducedMotion) rotation.set(target)
    else spinRef.current = animate(rotation, target, SNAP_SPRING)
    selectPlanet(planets[wrapIndex(index)].id)
  }

  function velocityFromSamples(samples: { t: number; x: number }[]) {
    if (samples.length < 2) return 0
    const latest = samples[samples.length - 1]
    const windowStart = latest.t - VELOCITY_WINDOW_MS
    let earliest = samples[0]
    for (let i = 0; i < samples.length; i += 1) {
      if (samples[i].t >= windowStart) {
        earliest = samples[i]
        break
      }
    }
    const dt = latest.t - earliest.t
    if (dt < 12) return 0
    return ((earliest.x - latest.x) * DRAG_DEG_PER_PX) / (dt / 1000)
  }

  function coastToRest(velocity: number) {
    const origin = rotation.get()
    const target = snapCoastTarget(origin + velocity * COAST_POWER, origin, velocity)
    spinIdRef.current += 1
    const spinId = spinIdRef.current
    spinRef.current?.stop()
    if (reducedMotion) {
      rotation.set(target)
      selectPlanet(planets[nearestIndex(target)].id)
      return
    }
    const spin = animate(rotation, target, {
      type: 'inertia',
      velocity,
      power: COAST_POWER,
      timeConstant: COAST_TIME_CONSTANT,
      restDelta: 0.5,
      modifyTarget: (projected) => snapCoastTarget(projected, origin, velocity),
    })
    spinRef.current = spin
    void spin.then(() => {
      if (spinIdRef.current !== spinId) return
      selectPlanet(planets[nearestIndex(rotation.get())].id)
    })
  }

  function openSettings() {
    play('toggle', { volume: 0.32 })
    onSettingsOpenChange(true)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || settingsOpen) return
    event.currentTarget.setPointerCapture(event.pointerId)
    stopSpin()
    armSound()
    play('press', { volume: 0.3 })
    hapticPress()
    dragRef.current = {
      moved: false,
      planetIndex: planetIndexFromTarget(event.target),
      pointerId: event.pointerId,
      pulled: false,
      samples: [{ t: performance.now(), x: event.clientX }],
      startRotation: rotation.get(),
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.pulled && dy < -OPEN_PULL && Math.abs(dy) > Math.abs(dx) + 6) {
      drag.pulled = true
      openSettings()
      return
    }
    if (drag.pulled) return
    if (Math.abs(dx) > 4) drag.moved = true
    const now = performance.now()
    drag.samples.push({ t: now, x: event.clientX })
    while (drag.samples.length > 1 && now - drag.samples[0].t > VELOCITY_WINDOW_MS) {
      drag.samples.shift()
    }
    rotation.set(drag.startRotation - dx * DRAG_DEG_PER_PX)
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (drag.pulled) return
    ignorePlanetClickRef.current = true
    if (!drag.moved && drag.planetIndex != null) {
      snapTo(drag.planetIndex)
      return
    }
    drag.samples.push({ t: performance.now(), x: event.clientX })
    coastToRest(velocityFromSamples(drag.samples))
  }

  return (
    <div {...stylex.props(styles.dock)} aria-label="Planet wheel">
      <div
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        {...stylex.props(styles.surface)}
      >
        <div {...stylex.props(styles.bezel)} aria-hidden="true">
          <span {...stylex.props(styles.track)} />
          <span {...stylex.props(styles.disc)} />
          <WheelTicks rotation={rotation} />
        </div>

        <div {...stylex.props(styles.orbit)}>
          {planets.map((planet, index) => (
            <WheelPlanet
              index={index}
              key={planet.id}
              onSelect={(id) => {
                if (ignorePlanetClickRef.current) {
                  ignorePlanetClickRef.current = false
                  return
                }
                snapTo(planets.findIndex((planet) => planet.id === id))
              }}
              rotation={rotation}
              selected={planet.id === selectedPlanet}
            />
          ))}
        </div>
      </div>

      <div {...stylex.props(styles.chrome)}>
        <button
          aria-expanded={settingsOpen}
          aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
          onClick={() => {
            if (suppressGearClickRef.current) {
              suppressGearClickRef.current = false
              return
            }
            play('toggle', { volume: 0.32 })
            onSettingsOpenChange(!settingsOpen)
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = {
              moved: false,
              planetIndex: null,
              pointerId: event.pointerId,
              pulled: false,
              samples: [{ t: performance.now(), x: event.clientX }],
              startRotation: rotation.get(),
              startX: event.clientX,
              startY: event.clientY,
            }
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            const dy = event.clientY - drag.startY
            if (dy < -OPEN_PULL) {
              drag.pulled = true
              suppressGearClickRef.current = true
              openSettings()
            }
          }}
          onPointerUp={() => {
            dragRef.current = null
          }}
          type="button"
          {...stylex.props(styles.gear, settingsOpen && styles.gearOpen)}
        >
          <ChevronUpIcon />
        </button>
      </div>
    </div>
  )
}

export function SettingsSheet({
  children,
  onOpenChange,
  open,
}: {
  children: ReactNode
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [snapPoint, setSnapPoint] = useState<Drawer.Root.SnapPoint>(PRESET_SNAP)
  const expandedSnap = useExpandedSnapPoint(EXPANDED_NUDGE_PX)

  return (
    <Drawer.Root
      modal={false}
      onOpenChange={(next) => {
        if (next) setSnapPoint(PRESET_SNAP)
        onOpenChange(next)
      }}
      onSnapPointChange={(next) => {
        if (next != null) setSnapPoint(next)
      }}
      open={open}
      snapPoint={open ? snapPoint : null}
      snapPoints={[PRESET_SNAP, expandedSnap]}
      snapToSequentialPoints
      swipeDirection="down"
    >
      <Drawer.Portal>
        <Drawer.Viewport {...stylex.props(styles.viewport)}>
          <Drawer.Popup {...stylex.props(styles.popup)}>
            <div {...stylex.props(styles.sheetSurface)}>
              <div {...stylex.props(styles.sheetClip)}>
                <div {...stylex.props(styles.sheetHandle)} aria-hidden="true" />
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
              </div>
              <div aria-hidden="true" {...stylex.props(styles.sheetBottomMask)} />
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

const styles = stylex.create({
  bezel: {
    height: WHEEL_SIZE,
    left: '50%',
    pointerEvents: 'none',
    position: 'absolute',
    top: -4,
    transform: 'translateX(-50%)',
    width: WHEEL_SIZE,
  },
  disc: {
    backgroundColor: 'color-mix(in oklch, var(--control-accent) 72%, black)',
    borderRadius: '50%',
    inset: RING,
    position: 'absolute',
  },
  // Same two mixes and lip as the reset chip. The ramp runs across the
  // ring (outer = chip top, inner = chip bottom) so iso-lines follow the
  // arc instead of cutting the box as a rectangle or a 12-o'clock spot.
  track: {
    backgroundColor: 'color-mix(in oklch, var(--control-accent) 84%, black)',
    backgroundImage:
      'radial-gradient(in oklch circle closest-side at 50% 50%, color-mix(in oklch, var(--control-accent) 81%, black) 0%, color-mix(in oklch, var(--control-accent) 81%, black) 74%, color-mix(in oklch, var(--control-accent) 90%, black) 99%, var(--control-accent) 100%)',
    borderRadius: '50%',
    boxShadow: 'oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset',
    inset: 0,
    position: 'absolute',
  },
  dock: {
    bottom: 'auto',
    display: 'none',
    height: 'var(--showcase-wheel-height, 126px)',
    left: 0,
    pointerEvents: 'none',
    position: 'fixed',
    right: 0,
    top: 'calc(var(--visual-viewport-offset-top, 0px) + var(--visual-viewport-height, 100dvh) - var(--showcase-wheel-height, 126px))',
    zIndex: 20,
    '@media (max-width: 960px)': {
      display: 'block',
    },
  },
  chrome: {
    alignItems: 'center',
    bottom: 16,
    display: 'flex',
    justifyContent: 'center',
    left: '50%',
    pointerEvents: 'none',
    position: 'absolute',
    transform: 'translateX(-50%)',
    zIndex: 3,
  },
  gear: {
    alignItems: 'center',
    appearance: 'none',
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(in oklch 180deg, color-mix(in oklch, var(--control-accent) 90%, white) 0%, color-mix(in oklch, var(--control-accent) 81%, black) 100%)',
    borderWidth: 0,
    borderRadius: '50%',
    boxShadow: {
      default: 'oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset',
      ':focus-visible':
        'oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset, 0 0 0 3px color-mix(in oklch, var(--control-accent) 22%, transparent)',
    },
    color: 'oklch(86.4% 0.003 84.6)',
    cursor: 'pointer',
    display: 'grid',
    height: 36,
    justifyContent: 'center',
    padding: 0,
    placeItems: 'center',
    pointerEvents: 'auto',
    width: 36,
    ':focus-visible': {
      outline: 'none',
    },
  },
  gearIcon: {
    display: 'block',
    fill: 'none',
    height: 16,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.5,
    width: 16,
  },
  gearOpen: {
    color: '#f2e8d0',
  },
  orbit: {
    height: 0,
    left: '50%',
    pointerEvents: 'none',
    position: 'absolute',
    top: ORBIT_TOP,
    width: 0,
  },
  planet: {
    alignItems: 'center',
    appearance: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: 'rgba(242, 232, 208, 0.42)',
    cursor: 'pointer',
    display: 'flex',
    height: 44,
    justifyContent: 'center',
    left: -22,
    padding: 0,
    pointerEvents: 'auto',
    position: 'absolute',
    top: -22,
    width: 44,
    ':focus-visible': {
      outline: '2px solid #f2e8d0',
      outlineOffset: 2,
    },
  },
  planetActive: {
    color: '#f2e8d0',
  },
  planetImage: {
    display: 'block',
    height: 36,
    objectFit: 'contain',
    pointerEvents: 'none',
    position: 'relative',
    width: 36,
  },
  popup: {
    backgroundColor: 'transparent',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    height: '50dvh',
    maxHeight: '50dvh',
    minHeight: 0,
    outline: 'none',
    overflow: 'visible',
    paddingBottom:
      'max(0px, calc(var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y)))',
    pointerEvents: 'auto',
    position: 'relative',
    transform: 'translateY(calc(var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y)))',
    transitionDuration: '450ms',
    transitionProperty: 'transform, padding-bottom',
    transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
    width: '100%',
    willChange: 'transform',
    ':is([data-swiping])': {
      transitionDuration: '0ms',
    },
    ':is([data-starting-style], [data-ending-style])': {
      paddingBottom: 0,
      transform: 'translateY(100%)',
    },
    ':is([data-ending-style])': {
      transitionDuration: 'calc(var(--drawer-swipe-strength, 1) * 400ms)',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  // Sits in the visible content box so radius/gap start as soon as the sheet leaves the flush snap.
  // Drawer registers its travel vars with inherits:false; pull them onto this node so progress is real.
  sheetSurface: {
    '--drawer-snap-point-offset': 'inherit',
    '--drawer-swipe-movement-y': 'inherit',
    '--slider-progress-bg': 'oklch(43.49% 0 0)',
    '--slider-track-bg': 'oklch(35.62% 0 0)',
    backdropFilter: 'blur(22px) saturate(0.72)',
    backgroundColor: 'lab(5 0 0 / 0.42)',
    borderBottomLeftRadius: `calc(${SHEET_RADIUS} * ${SHEET_PROGRESS})`,
    borderBottomRightRadius: `calc(${SHEET_RADIUS} * ${SHEET_PROGRESS})`,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 0.102), inset 0 0 0 1px oklch(100% 0 0 / 0.039)',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    marginBottom: `calc(${FLOAT_GAP} * ${SHEET_PROGRESS})`,
    marginInline: FLOAT_GAP,
    minHeight: 0,
    overflow: 'visible',
    position: 'relative',
    transitionDuration: 'inherit',
    transitionProperty: 'margin, border-radius',
    zIndex: 1,
    transitionTimingFunction: 'inherit',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  sheetClip: {
    '--drawer-snap-point-offset': 'inherit',
    '--drawer-swipe-movement-y': 'inherit',
    borderRadius: 'inherit',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  sheetBottomMask: {
    '--drawer-snap-point-offset': 'inherit',
    '--drawer-swipe-movement-y': 'inherit',
    backgroundImage:
      'linear-gradient(in oklch to bottom, transparent 0%, lab(5 0 0 / 0.1) 20%, lab(5 0 0 / 0.34) 46%, lab(5 0 0 / 0.14) 74%, transparent 100%)',
    bottom: `calc(-1 * (84px + ${FLOAT_GAP}) * ${SHEET_PROGRESS})`,
    height: `calc((116px + ${FLOAT_GAP}) * ${SHEET_PROGRESS})`,
    left: 0,
    opacity: SHEET_PROGRESS,
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
  sheetBody: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    touchAction: 'auto',
  },
  sheetScroll: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  sheetScrollViewport: {
    flex: 1,
    minHeight: 0,
    overflowX: 'hidden',
    overflowY: 'scroll',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
  },
  sheetScrollContent: {
    paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
    paddingInline: 20,
    paddingTop: 4,
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
  sheetHandle: {
    alignItems: 'center',
    display: 'flex',
    flexShrink: 0,
    height: 22,
    justifyContent: 'center',
    '::after': {
      backgroundColor: 'rgba(242, 232, 208, 0.22)',
      borderRadius: 2,
      content: '""',
      height: 3,
      width: 36,
    },
  },
  viewport: {
    alignItems: 'flex-end',
    display: 'flex',
    height: 'var(--visual-viewport-height, 100dvh)',
    justifyContent: 'center',
    left: 0,
    pointerEvents: 'none',
    position: 'fixed',
    right: 0,
    top: 'var(--visual-viewport-offset-top, 0px)',
    touchAction: 'none',
    zIndex: 24,
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
  surface: {
    height: '100%',
    pointerEvents: 'auto',
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
  },
  ticks: {
    inset: 0,
    position: 'absolute',
    transformBox: 'view-box',
    transformOrigin: 'center',
  },
})
