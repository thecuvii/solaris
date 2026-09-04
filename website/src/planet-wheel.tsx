import { Drawer } from '@base-ui/react/drawer'
import * as stylex from '@stylexjs/stylex'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { PlanetId } from './showcase-data'
import { planets } from './showcase-data'

const MOBILE_QUERY = '(max-width: 960px)'
const STEP = 360 / planets.length
const RADIUS = 152
const DRAG_DEG_PER_PX = 0.48
const OPEN_PULL = 36
const PRESET_SNAP = 0.25
const EXPANDED_SNAP = 0.5
// Offset at the flush snap (max 50dvh − first snap 25dvh). Morph finishes 5dvh later (0.30).
const PRESET_TRAVEL = '25dvh'
const MORPH_RANGE = '5dvh'
const FLOAT_GAP = '12px'
const SHEET_RADIUS = '16px'
const SHEET_PROGRESS = `clamp(0, (${PRESET_TRAVEL} - (var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y))) / ${MORPH_RANGE}, 1)`

function subscribeMobile(onStoreChange: () => void) {
  const media = window.matchMedia(MOBILE_QUERY)
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

export function useMobileShowcase() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

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

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...stylex.props(styles.gearIcon)}>
      <path
        d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm8.1 4.2c0-.4.3-.8.7-1l.6-.2-.6-1.8-.6.1c-.4.1-.8 0-1.1-.3l-.4-.5c-.2-.3-.3-.7-.1-1.1l.2-.6-1.8-.6-.2.6c-.1.4-.5.7-.9.7h-.6c-.4 0-.8-.3-.9-.7l-.2-.6-1.8.6.2.6c.1.4 0 .8-.3 1.1l-.5.4c-.3.2-.7.3-1.1.1l-.6-.2-.6 1.8.6.2c.4.1.7.5.7 1v.6c0 .4-.3.8-.7 1l-.6.2.6 1.8.6-.1c.4-.1.8 0 1.1.3l.4.5c.2.3.3.7.1 1.1l-.2.6 1.8.6.2-.6c.1-.4.5-.7.9-.7h.6c.4 0 .8.3.9.7l.2.6 1.8-.6-.2-.6c-.1-.4 0-.8.3-1.1l.5-.4c.3-.2.7-.3 1.1-.1l.6.2.6-1.8-.6-.2c-.4-.2-.7-.6-.7-1v-.6Z"
        fill="currentColor"
      />
    </svg>
  )
}

// Ring track: recessed dots on the bezel; faint ticks along the disc edge.
function WheelTicks() {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 360" {...stylex.props(styles.ticks)}>
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="solaris-wheel-inner-hairline"
          x1="56"
          x2="304"
          y1="0"
          y2="0"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="solaris-wheel-inner-hairline-mask" maskUnits="userSpaceOnUse">
          <rect fill="url(#solaris-wheel-inner-hairline)" height="360" width="360" x="0" y="0" />
        </mask>
      </defs>
      <circle
        cx={180}
        cy={180}
        fill="none"
        mask="url(#solaris-wheel-inner-hairline-mask)"
        r={124}
        stroke="rgba(120, 120, 128, 0.12)"
        strokeWidth={1}
      />
      {Array.from({ length: 72 }, (_, index) => {
        const angle = (index * 5 * Math.PI) / 180
        const cx = 180 + Math.cos(angle) * RADIUS
        const cy = 180 + Math.sin(angle) * RADIUS
        return (
          <g key={index}>
            <circle cx={cx} cy={cy + 0.7} fill="rgba(255, 255, 255, 0.07)" r={1.7} />
            <circle cx={cx} cy={cy} fill="#07080b" r={1.7} />
          </g>
        )
      })}
      {Array.from({ length: 48 }, (_, index) => {
        const angle = (index * 7.5 * Math.PI) / 180
        const inner = index % 4 === 0 ? 104 : 110
        const outer = 116
        return (
          <line
            key={`tick-${index}`}
            stroke="rgba(242, 232, 208, 0.09)"
            strokeWidth={0.7}
            x1={180 + Math.cos(angle) * inner}
            x2={180 + Math.cos(angle) * outer}
            y1={180 + Math.sin(angle) * inner}
            y2={180 + Math.sin(angle) * outer}
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
    pointerId: number
    startRotation: number
    startX: number
    startY: number
    pulled: boolean
  } | null>(null)
  const suppressGearClickRef = useRef(false)

  useEffect(() => {
    const target = selectedIndex * STEP
    const current = rotation.get()
    const next = current + shortestDelta(current, target)
    if (reducedMotion) {
      rotation.set(next)
      return
    }
    animate(rotation, next, { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 })
  }, [reducedMotion, rotation, selectedIndex])

  function snapTo(index: number) {
    const current = rotation.get()
    const target = current + shortestDelta(current, wrapIndex(index) * STEP)
    if (reducedMotion) rotation.set(target)
    else animate(rotation, target, { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 })
    onSelectPlanet(planets[wrapIndex(index)].id)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || settingsOpen) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      pulled: false,
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
      onSettingsOpenChange(true)
      return
    }
    if (drag.pulled) return
    rotation.set(drag.startRotation - dx * DRAG_DEG_PER_PX)
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (drag.pulled) return
    snapTo(nearestIndex(rotation.get()))
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
          <WheelTicks />
          <span {...stylex.props(styles.notch)} />
        </div>

        <div {...stylex.props(styles.orbit)}>
          {planets.map((planet, index) => (
            <WheelPlanet
              index={index}
              key={planet.id}
              onSelect={onSelectPlanet}
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
          onSettingsOpenChange(!settingsOpen)
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            pointerId: event.pointerId,
            pulled: false,
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
            onSettingsOpenChange(true)
          }
        }}
        onPointerUp={() => {
          dragRef.current = null
        }}
        type="button"
        {...stylex.props(styles.gear, settingsOpen && styles.gearOpen)}
      >
        <GearIcon />
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
    backgroundColor: '#0c0d10',
    // Disc (0–124px) with a soft dark lip, then the matte ring underneath.
    backgroundImage:
      'radial-gradient(circle at 50% 50%, #1a1b20 0px, #16171b 64px, #131418 108px, rgba(0, 0, 0, 0.18) 123px, transparent 124px), linear-gradient(180deg, #14151a 0%, #0b0c0f 100%)',
    borderRadius: '50%',
    borderWidth: 0,
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(255, 255, 255, 0.04), 0 12px 30px rgba(0, 0, 0, 0.5)',
    boxSizing: 'border-box',
    height: 360,
    left: '50%',
    pointerEvents: 'none',
    position: 'absolute',
    top: -4,
    transform: 'translateX(-50%)',
    width: 360,
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
    backgroundColor: '#1b1c21',
    backgroundImage:
      'radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 70%), linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(0, 0, 0, 0.22) 100%)',
    borderColor: 'rgba(255, 255, 255, 0.045)',
    borderRadius: '50%',
    borderStyle: 'solid',
    borderWidth: 1,
    bottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 1px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.22)',
    color: 'rgba(242, 232, 208, 0.82)',
    cursor: 'pointer',
    display: 'grid',
    height: 40,
    justifyContent: 'center',
    left: '50%',
    padding: 0,
    placeItems: 'center',
    pointerEvents: 'auto',
    position: 'absolute',
    transform: 'translateX(-50%)',
    width: 40,
    zIndex: 3,
    ':focus-visible': {
      outline: '2px solid #f2e8d0',
      outlineOffset: 3,
    },
  },
  gearIcon: {
    display: 'block',
    height: 18,
    width: 18,
  },
  gearOpen: {
    color: '#f2e8d0',
  },
  notch: {
    backgroundColor: 'rgba(242, 232, 208, 0.3)',
    borderRadius: 1,
    height: 6,
    left: '50%',
    position: 'absolute',
    top: 6,
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
