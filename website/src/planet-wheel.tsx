import { Drawer } from '@base-ui/react/drawer'
import * as stylex from '@stylexjs/stylex'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useEffect, useRef, useSyncExternalStore } from 'react'

import type { PlanetId } from './showcase-data'
import { planets } from './showcase-data'

const MOBILE_QUERY = '(max-width: 960px)'
const STEP = 360 / planets.length
const RADIUS = 132
const DRAG_DEG_PER_PX = 0.48
const OPEN_PULL = 36
const SETTINGS_SNAP = 0.78

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

function WheelTicks() {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 360" {...stylex.props(styles.ticks)}>
      {Array.from({ length: 72 }, (_, index) => {
        const major = index % 6 === 0
        const angle = (index * 5 * Math.PI) / 180
        const inner = major ? 154 : 160
        const outer = 172
        return (
          <line
            key={index}
            stroke="currentColor"
            strokeWidth={major ? 1.25 : 0.7}
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
      <span {...stylex.props(styles.planetName, selected && styles.planetNameActive)}>
        {planet.name}
      </span>
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
          <span {...stylex.props(styles.bezelFace)} />
          <span {...stylex.props(styles.bezelWell)} />
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
  return (
    <Drawer.Root
      onOpenChange={onOpenChange}
      open={open}
      snapPoint={open ? SETTINGS_SNAP : null}
      snapPoints={[SETTINGS_SNAP]}
      swipeDirection="down"
    >
      <Drawer.Portal>
        <Drawer.Backdrop {...stylex.props(styles.backdrop)} />
        <Drawer.Viewport {...stylex.props(styles.viewport)}>
          <Drawer.Popup {...stylex.props(styles.popup)}>
            <div {...stylex.props(styles.sheetHandle)} aria-hidden="true" />
            <Drawer.Title {...stylex.props(styles.visuallyHidden)}>Settings</Drawer.Title>
            <Drawer.Content {...stylex.props(styles.sheetBody)}>{children}</Drawer.Content>
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
    top: -48,
    transform: 'translateX(-50%)',
    width: 360,
  },
  bezelFace: {
    backgroundColor: '#0b0d12',
    borderRadius: '50%',
    boxShadow:
      'inset 0 1px 0 oklch(100% 0 0 / 0.06), inset 0 -1px 1px oklch(0% 0 0 / 0.38), 0 -16px 40px oklch(0% 0 0 / 0.42)',
    inset: 0,
    position: 'absolute',
  },
  bezelWell: {
    backgroundColor: 'oklch(16% 0 0)',
    borderRadius: '50%',
    boxShadow: 'inset 0 3px 8px oklch(0% 0 0 / 0.34), inset 0 1px 0 oklch(100% 0 0 / 0.04)',
    inset: 22,
    position: 'absolute',
  },
  dock: {
    bottom: 0,
    display: 'none',
    height: 'calc(168px + env(safe-area-inset-bottom, 0px))',
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
    backgroundColor: 'oklch(22% 0 0)',
    backgroundImage:
      'linear-gradient(180deg, color-mix(in oklch, var(--control-accent) 88%, white) 0%, color-mix(in oklch, var(--control-accent) 96%, black) 100%)',
    borderRadius: '50%',
    borderWidth: 0,
    bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
    boxShadow:
      'inset 0 1px 0 oklch(100% 0 0 / 0.16), inset 0 -1px 1px oklch(0% 0 0 / 0.28), 0 2px 6px oklch(0% 0 0 / 0.28)',
    color: 'oklch(18% 0.01 84)',
    cursor: 'pointer',
    display: 'grid',
    height: 48,
    justifyContent: 'center',
    left: '50%',
    padding: 0,
    placeItems: 'center',
    pointerEvents: 'auto',
    position: 'absolute',
    transform: 'translateX(-50%)',
    width: 48,
    zIndex: 3,
    ':focus-visible': {
      outline: '2px solid #f2e8d0',
      outlineOffset: 3,
    },
  },
  gearIcon: {
    display: 'block',
    height: 22,
    width: 22,
  },
  gearOpen: {
    color: 'oklch(12% 0.01 84)',
  },
  notch: {
    backgroundColor: 'rgba(242, 232, 208, 0.72)',
    borderRadius: 1,
    height: 10,
    left: '50%',
    position: 'absolute',
    top: 14,
    transform: 'translateX(-50%)',
    width: 2,
  },
  orbit: {
    height: 0,
    left: '50%',
    pointerEvents: 'none',
    position: 'absolute',
    top: 132,
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
    flexDirection: 'column',
    gap: 4,
    height: 64,
    justifyContent: 'flex-start',
    left: -28,
    padding: 0,
    pointerEvents: 'auto',
    position: 'absolute',
    top: -28,
    width: 56,
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
  planetName: {
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 9,
    fontWeight: 550,
    letterSpacing: '-0.01em',
    lineHeight: 1.1,
    maxWidth: 72,
    overflow: 'hidden',
    pointerEvents: 'none',
    textAlign: 'center',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  planetNameActive: {
    color: '#f2e8d0',
  },
  backdrop: {
    backgroundColor: 'black',
    inset: 0,
    opacity: 'calc(0.46 * (1 - var(--drawer-swipe-progress, 0)))',
    position: 'fixed',
    transitionDuration: '450ms',
    transitionProperty: 'opacity',
    transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
    ':is([data-starting-style], [data-ending-style])': {
      opacity: 0,
    },
    ':is([data-swiping])': {
      transitionDuration: '0ms',
    },
    ':is([data-ending-style])': {
      transitionDuration: 'calc(var(--drawer-swipe-strength, 1) * 400ms)',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  popup: {
    backgroundColor: '#0b0d12',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 0.06), 0 -18px 40px oklch(0% 0 0 / 0.36)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '78dvh',
    outline: 'none',
    overflow: 'hidden',
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
    color: 'rgba(242, 232, 208, 0.22)',
    inset: 0,
    position: 'absolute',
  },
})
