'use client'

import { Drawer } from '@base-ui/react/drawer'
import * as stylex from '@stylexjs/stylex'
import { play } from 'cuelume'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { planets, type PlanetId } from './showcase-data'

const STEP = 360 / planets.length
const RADIUS = 152
const DRAG_DEG_PER_PX = 0.48
const OPEN_PULL = 36
const MAX_COAST_STEPS = 6
const COAST_SECONDS = 0.42
const VELOCITY_WINDOW_MS = 90
const SNAP_SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 } as const
const COAST_SPRING = { type: 'spring', stiffness: 88, damping: 16, mass: 1.15 } as const
const PRESET_SNAP = 0.25
const EXPANDED_SNAP = 0.5
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

function shortestDelta(from: number, to: number) {
  let delta = ((to - from) % 360) + 360
  delta %= 360
  return delta > 180 ? delta - 360 : delta
}

function ChevronUpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.gearIcon)}>
      <path d="M3.5 10.25 8 5.75l4.5 4.5" />
    </svg>
  )
}

// Dial scale engraved on the track's inner lip, hugging the recessed face.
// Each planet slot is subdivided into TICKS_PER_STEP so minor ticks always
// line up with the detents. The scale stops at r=136, short of the smallest
// planet disc (~r 141), so nothing ever runs through a planet.
const TICKS_PER_STEP = 4
const TICK_STEP = STEP / TICKS_PER_STEP
const TICK_OUTER = 136

function tickIndex(rotation: number) {
  return Math.round(rotation / TICK_STEP)
}

function playDetent(rotation: number) {
  const major = ((tickIndex(rotation) % TICKS_PER_STEP) + TICKS_PER_STEP) % TICKS_PER_STEP === 0
  play('tick', { volume: major ? 0.48 : 0.22 })
}

function WheelTicks() {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 360" {...stylex.props(styles.ticks)}>
      {Array.from({ length: planets.length * TICKS_PER_STEP }, (_, index) => {
        const major = index % TICKS_PER_STEP === 0
        const angle = (((index * STEP) / TICKS_PER_STEP - 90) * Math.PI) / 180
        const inner = major ? 131 : 133.5
        return (
          <line
            key={`tick-${index}`}
            stroke={major ? 'rgba(242, 232, 208, 0.18)' : 'rgba(242, 232, 208, 0.08)'}
            strokeLinecap="round"
            strokeWidth={major ? 1 : 0.55}
            x1={180 + Math.cos(angle) * inner}
            x2={180 + Math.cos(angle) * TICK_OUTER}
            y1={180 + Math.sin(angle) * inner}
            y2={180 + Math.sin(angle) * TICK_OUTER}
          />
        )
      })}
    </svg>
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
    const angle = ((index * STEP - value - 90) * Math.PI) / 180
    return Math.cos(angle) * RADIUS
  })
  const y = useTransform(rotation, (value) => {
    const angle = ((index * STEP - value - 90) * Math.PI) / 180
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
    const projected = origin + velocity * COAST_SECONDS
    const maxTravel = STEP * MAX_COAST_STEPS
    const clamped = Math.min(Math.max(projected, origin - maxTravel), origin + maxTravel)
    const target = Math.round(clamped / STEP) * STEP
    spinIdRef.current += 1
    const spinId = spinIdRef.current
    spinRef.current?.stop()
    if (reducedMotion) {
      rotation.set(target)
      selectPlanet(planets[nearestIndex(target)].id)
      return
    }
    const spin = animate(rotation, target, { ...COAST_SPRING, velocity })
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
    dragRef.current = {
      moved: false,
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
    if (drag.moved) ignorePlanetClickRef.current = true
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
          <WheelTicks />
          <span {...stylex.props(styles.notch)} />
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
      snapPoints={[PRESET_SNAP, EXPANDED_SNAP]}
      snapToSequentialPoints
      swipeDirection="down"
    >
      <Drawer.Portal>
        <Drawer.Viewport {...stylex.props(styles.viewport)}>
          <Drawer.Popup {...stylex.props(styles.popup)}>
            <div aria-hidden="true" {...stylex.props(styles.sheetBottomMask)} />
            <div {...stylex.props(styles.sheetSurface)}>
              <div {...stylex.props(styles.sheetClip)}>
                <div {...stylex.props(styles.sheetHandle)} aria-hidden="true" />
                <Drawer.Title {...stylex.props(styles.visuallyHidden)}>Settings</Drawer.Title>
                <Drawer.Content {...stylex.props(styles.sheetBody)}>{children}</Drawer.Content>
              </div>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

const styles = stylex.create({
  bezel: {
    height: 360,
    left: '50%',
    pointerEvents: 'none',
    position: 'absolute',
    top: -4,
    transform: 'translateX(-50%)',
    width: 360,
  },
  disc: {
    backgroundColor: 'color-mix(in oklch, var(--control-accent) 72%, black)',
    borderRadius: '50%',
    inset: 56,
    position: 'absolute',
  },
  track: {
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(in oklch 180deg, color-mix(in oklch, var(--control-accent) 90%, white) 0%, color-mix(in oklch, var(--control-accent) 81%, black) 100%)',
    borderRadius: '50%',
    boxShadow: 'oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset',
    inset: 0,
    position: 'absolute',
  },
  dock: {
    bottom: 0,
    display: 'none',
    height: 'calc(128px + env(safe-area-inset-bottom, 0px))',
    left: 0,
    pointerEvents: 'none',
    position: 'fixed',
    right: 0,
    zIndex: 20,
    '@media (max-width: 960px)': {
      display: 'block',
    },
  },
  gear: {
    alignItems: 'center',
    appearance: 'none',
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(in oklch 180deg, color-mix(in oklch, var(--control-accent) 90%, white) 0%, color-mix(in oklch, var(--control-accent) 81%, black) 100%)',
    borderWidth: 0,
    borderRadius: '50%',
    bottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
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
    left: '50%',
    padding: 0,
    placeItems: 'center',
    pointerEvents: 'auto',
    position: 'absolute',
    transform: 'translateX(-50%)',
    width: 36,
    zIndex: 3,
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
  notch: {
    backgroundColor: 'rgba(242, 232, 208, 0.45)',
    borderRadius: 1,
    height: 6,
    left: '50%',
    position: 'absolute',
    top: 1,
    transform: 'translateX(-50%)',
    width: 2,
  },
  orbit: {
    height: 0,
    left: '50%',
    pointerEvents: 'none',
    position: 'absolute',
    top: 176,
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
    maxHeight: '50dvh',
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
    backgroundColor: 'oklch(34.49% 0.0017 286.3 / 0.831)',
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
      'linear-gradient(to top, rgba(7, 8, 13, 0.88) 0%, rgba(7, 8, 13, 0) 100%), linear-gradient(to top, rgba(9, 12, 20, 0.55) 0%, rgba(9, 12, 20, 0) 58%), linear-gradient(to top, rgba(9, 12, 20, 0.28) 0%, rgba(9, 12, 20, 0) 32%)',
    // Sit on the visible viewport bottom (content-box edge), behind the card.
    bottom: 'calc(var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y))',
    height: `calc(${FLOAT_GAP} * ${SHEET_PROGRESS} + 36px * ${SHEET_PROGRESS})`,
    left: FLOAT_GAP,
    opacity: SHEET_PROGRESS,
    pointerEvents: 'none',
    position: 'absolute',
    right: FLOAT_GAP,
    transitionDuration: 'inherit',
    transitionProperty: 'opacity, height, bottom',
    transitionTimingFunction: 'inherit',
    zIndex: 0,
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  sheetBody: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
    paddingInline: 20,
    paddingTop: 4,
    touchAction: 'auto',
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
    inset: 0,
    justifyContent: 'center',
    pointerEvents: 'none',
    position: 'fixed',
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
  },
})
