import * as stylex from '@stylexjs/stylex'
import NumberFlow, { continuous } from '@number-flow/react'
import { useAtom, useSetAtom } from 'jotai'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { hapticPress, hapticTick } from './haptics'
import { tokens } from './tokens.stylex'
import { numberFlowFormat, numberFlowTimings } from './setting-format'
import { useMobileShowcase } from './use-mobile-showcase'
import type { PlanetId } from './showcase-data'
import type { ParameterDefinition } from '../planet-params/planet-params'
import { setSliderGestureAtom, settingAtom } from './showcase-settings'

type NumberParameter = Extract<ParameterDefinition, { kind: 'number' }>

const THUMB = 12
const INSET = 16
const POSE_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'Home',
  'PageDown',
  'PageUp',
])

export function splitPosePad(definitions: readonly ParameterDefinition[]): {
  pad: { tilt: NumberParameter; yaw: NumberParameter } | null
  rest: readonly ParameterDefinition[]
} {
  const yaw = definitions.find((definition) => definition.name === 'yaw')
  const tilt = definitions.find((definition) => definition.name === 'tilt')
  if (yaw?.kind !== 'number' || tilt?.kind !== 'number') {
    return { pad: null, rest: definitions }
  }

  return {
    pad: { tilt, yaw },
    rest: definitions.filter(
      (definition) => definition.name !== 'yaw' && definition.name !== 'tilt',
    ),
  }
}

export const PosePad = memo(function PosePad({
  planetId,
  tilt,
  yaw,
}: {
  planetId: PlanetId
  tilt: NumberParameter
  yaw: NumberParameter
}) {
  const [yawValue, setYawValue] = useAtom(settingAtom({ name: yaw.name, planetId }))
  const [tiltValue, setTiltValue] = useAtom(settingAtom({ name: tilt.name, planetId }))
  const yawNumber = Number(yawValue)
  const tiltNumber = Number(tiltValue)
  const reduceMotion = useReducedMotion()
  const forceProgressHover = useMobileShowcase()
  const setSliderGesture = useSetAtom(setSliderGestureAtom)
  const padRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<{ id: number } | null>(null)
  const interactingRef = useRef(false)
  const keyboardGestureRef = useRef(false)
  const padRectRef = useRef<DOMRect | null>(null)
  const sizeRef = useRef({ height: 0, width: 0 })
  const lastHapticRef = useRef({ tilt: tiltNumber, yaw: yawNumber })
  const poseRef = useRef({ tilt: tiltNumber, yaw: yawNumber })
  const animationXRef = useRef<ReturnType<typeof animate> | null>(null)
  const animationYRef = useRef<ReturnType<typeof animate> | null>(null)
  const thumbX = useMotionValue(INSET)
  const thumbY = useMotionValue(INSET)
  const [hovered, setHovered] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [focused, setFocused] = useState(false)
  const active = hovered || interacting || focused
  const originX = toProgress(0, yaw.min, yaw.max)
  const originY = 1 - toProgress(0, tilt.min, tilt.max)

  function setGestureActive(next: boolean) {
    interactingRef.current = next
    setInteracting(next)
    setSliderGesture(next)
  }

  const placeThumb = useCallback(
    (yawProgress: number, tiltProgress: number) => {
      const { height, width } = sizeRef.current
      if (width === 0 || height === 0) return
      thumbX.set(INSET + yawProgress * (width - INSET * 2) - THUMB / 2)
      thumbY.set(INSET + (1 - tiltProgress) * (height - INSET * 2) - THUMB / 2)
    },
    [thumbX, thumbY],
  )

  const animateTo = useCallback(
    (yawProgress: number, tiltProgress: number, bounce = 0.18) => {
      const { height, width } = sizeRef.current
      if (width === 0 || height === 0) return
      animationXRef.current?.stop()
      animationYRef.current?.stop()
      const nextX = INSET + yawProgress * (width - INSET * 2) - THUMB / 2
      const nextY = INSET + (1 - tiltProgress) * (height - INSET * 2) - THUMB / 2
      if (reduceMotion) {
        thumbX.set(nextX)
        thumbY.set(nextY)
        return
      }
      animationXRef.current = animate(thumbX, nextX, { bounce, duration: 0.35, type: 'spring' })
      animationYRef.current = animate(thumbY, nextY, { bounce, duration: 0.35, type: 'spring' })
    },
    [reduceMotion, thumbX, thumbY],
  )

  function commit(nextYaw: number, nextTilt: number) {
    if (nextYaw !== yawNumber) setYawValue(nextYaw)
    if (nextTilt !== tiltNumber) setTiltValue(nextTilt)
  }

  function updateFromPointer(clientX: number, clientY: number) {
    const pad = padRef.current
    if (!pad) return { tilt: tiltNumber, yaw: yawNumber }

    const rect = (padRectRef.current ??= pad.getBoundingClientRect())
    const spanX = Math.max(rect.width - INSET * 2, 1)
    const spanY = Math.max(rect.height - INSET * 2, 1)
    const yawProgress = clamp((clientX - rect.left - INSET) / spanX, 0, 1)
    const tiltProgress = 1 - clamp((clientY - rect.top - INSET) / spanY, 0, 1)
    placeThumb(yawProgress, tiltProgress)

    return {
      yaw: quantize(fromProgress(yawProgress, yaw.min, yaw.max), yaw.min, yaw.max, yaw.step),
      tilt: quantize(fromProgress(tiltProgress, tilt.min, tilt.max), tilt.min, tilt.max, tilt.step),
    }
  }

  const cancelGesture = useCallback(() => {
    if (!pointerRef.current) return
    pointerRef.current = null
    padRectRef.current = null
    interactingRef.current = false
    setInteracting(false)
    setSliderGesture(false)
    animateTo(
      toProgress(yawNumber, yaw.min, yaw.max),
      toProgress(tiltNumber, tilt.min, tilt.max),
      0.1,
    )
  }, [animateTo, setSliderGesture, tilt.max, tilt.min, tiltNumber, yaw.max, yaw.min, yawNumber])

  function hapticForPose(nextYaw: number, nextTilt: number) {
    if (!forceProgressHover) return
    const previous = lastHapticRef.current
    if (nextYaw === previous.yaw && nextTilt === previous.tilt) return
    lastHapticRef.current = { tilt: nextTilt, yaw: nextYaw }

    const hitBound =
      nextYaw <= yaw.min || nextYaw >= yaw.max || nextTilt <= tilt.min || nextTilt >= tilt.max
    if (hitBound) {
      hapticTick(true)
      return
    }

    const crossedZero =
      (Math.sign(previous.yaw) !== Math.sign(nextYaw) && nextYaw === 0) ||
      (Math.sign(previous.tilt) !== Math.sign(nextTilt) && nextTilt === 0)
    if (crossedZero) hapticTick(false)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    animationXRef.current?.stop()
    animationYRef.current?.stop()
    padRectRef.current = event.currentTarget.getBoundingClientRect()
    pointerRef.current = { id: event.pointerId }
    lastHapticRef.current = { tilt: tiltNumber, yaw: yawNumber }
    setGestureActive(true)
    if (forceProgressHover) hapticPress()
    const next = updateFromPointer(event.clientX, event.clientY)
    commit(next.yaw, next.tilt)
    hapticForPose(next.yaw, next.tilt)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointers and already-released ids throw here.
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return
    const next = updateFromPointer(event.clientX, event.clientY)
    commit(next.yaw, next.tilt)
    hapticForPose(next.yaw, next.tilt)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return
    pointerRef.current = null
    const next = updateFromPointer(event.clientX, event.clientY)
    padRectRef.current = null
    commit(next.yaw, next.tilt)
    hapticForPose(next.yaw, next.tilt)
    setGestureActive(false)
    animateTo(toProgress(next.yaw, yaw.min, yaw.max), toProgress(next.tilt, tilt.min, tilt.max))
  }

  function releaseKeyboardGesture() {
    if (!keyboardGestureRef.current) return
    keyboardGestureRef.current = false
    setSliderGesture(false)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!POSE_KEYS.has(event.key)) return
    event.preventDefault()
    animationXRef.current?.stop()
    animationYRef.current?.stop()
    if (!keyboardGestureRef.current) {
      keyboardGestureRef.current = true
      setSliderGesture(true)
    }

    const yawStep = event.shiftKey ? yaw.step * 10 : yaw.step
    const tiltStep = event.shiftKey ? tilt.step * 10 : tilt.step
    let nextYaw = yawNumber
    let nextTilt = tiltNumber

    if (event.key === 'ArrowLeft')
      nextYaw = quantize(yawNumber - yawStep, yaw.min, yaw.max, yaw.step)
    if (event.key === 'ArrowRight')
      nextYaw = quantize(yawNumber + yawStep, yaw.min, yaw.max, yaw.step)
    if (event.key === 'ArrowDown')
      nextTilt = quantize(tiltNumber - tiltStep, tilt.min, tilt.max, tilt.step)
    if (event.key === 'ArrowUp')
      nextTilt = quantize(tiltNumber + tiltStep, tilt.min, tilt.max, tilt.step)
    if (event.key === 'PageDown')
      nextTilt = quantize(tiltNumber - tilt.step * 10, tilt.min, tilt.max, tilt.step)
    if (event.key === 'PageUp')
      nextTilt = quantize(tiltNumber + tilt.step * 10, tilt.min, tilt.max, tilt.step)
    if (event.key === 'Home') {
      nextYaw = quantize(0, yaw.min, yaw.max, yaw.step)
      nextTilt = quantize(0, tilt.min, tilt.max, tilt.step)
    }

    commit(nextYaw, nextTilt)
    placeThumb(toProgress(nextYaw, yaw.min, yaw.max), toProgress(nextTilt, tilt.min, tilt.max))
    hapticForPose(nextYaw, nextTilt)
  }

  useLayoutEffect(() => {
    poseRef.current = { tilt: tiltNumber, yaw: yawNumber }
  }, [tiltNumber, yawNumber])

  useLayoutEffect(() => {
    const surface = padRef.current
    if (!surface) return

    function measure() {
      const pad = padRef.current
      if (!pad) return
      sizeRef.current = { height: pad.offsetHeight, width: pad.offsetWidth }
      if (interactingRef.current) return
      const pose = poseRef.current
      placeThumb(toProgress(pose.yaw, yaw.min, yaw.max), toProgress(pose.tilt, tilt.min, tilt.max))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [placeThumb, tilt.max, tilt.min, yaw.max, yaw.min])

  useEffect(() => {
    if (interactingRef.current || keyboardGestureRef.current) return
    animateTo(
      toProgress(yawNumber, yaw.min, yaw.max),
      toProgress(tiltNumber, tilt.min, tilt.max),
      0.12,
    )
  }, [animateTo, tilt.max, tilt.min, tiltNumber, yaw.max, yaw.min, yawNumber])

  useEffect(() => {
    window.addEventListener('blur', cancelGesture)
    return () => window.removeEventListener('blur', cancelGesture)
  }, [cancelGesture])

  useEffect(() => {
    return () => {
      animationXRef.current?.stop()
      animationYRef.current?.stop()
    }
  }, [])

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.readouts)}>
        <AxisReadout active={active} label={yaw.label} suffix={yaw.suffix} value={yawNumber} />
        <AxisReadout active={active} label={tilt.label} suffix={tilt.suffix} value={tiltNumber} />
      </div>
      <div
        ref={padRef}
        aria-label={`Yaw ${yawNumber} degrees, tilt ${tiltNumber} degrees`}
        onBlur={() => {
          setFocused(false)
          releaseKeyboardGesture()
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        onKeyUp={releaseKeyboardGesture}
        onLostPointerCapture={cancelGesture}
        onPointerCancel={cancelGesture}
        onPointerDown={handlePointerDown}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="group"
        tabIndex={0}
        {...stylex.props(styles.pad, interacting && styles.padActive)}
      >
        <span
          aria-hidden="true"
          style={{ left: `${originX * 100}%` }}
          {...stylex.props(styles.axisVertical, active && styles.axisActive)}
        />
        <span
          aria-hidden="true"
          style={{ top: `${originY * 100}%` }}
          {...stylex.props(styles.axisHorizontal, active && styles.axisActive)}
        />
        <span
          aria-hidden="true"
          style={{ left: `${originX * 100}%`, top: `${originY * 100}%` }}
          {...stylex.props(styles.origin, active && styles.originActive)}
        />
        <motion.div
          aria-hidden="true"
          style={{ x: thumbX, y: thumbY }}
          {...stylex.props(styles.thumb, active && styles.thumbActive)}
        />
      </div>
    </div>
  )
})

const AxisReadout = memo(function AxisReadout({
  active,
  label,
  suffix = '',
  value,
}: {
  active: boolean
  label: string
  suffix?: string
  value: number
}) {
  return (
    <div {...stylex.props(styles.readout)}>
      <span {...stylex.props(styles.readoutLabel)}>{label}</span>
      <span {...stylex.props(styles.readoutValue)}>
        <NumberFlow
          format={numberFlowFormat(0)}
          isolate
          plugins={[continuous]}
          value={value}
          willChange
          {...numberFlowTimings}
          {...stylex.props(styles.readoutDigits, active && styles.readoutDigitsActive)}
        />
        {suffix ? (
          <span {...stylex.props(styles.readoutSuffix, active && styles.readoutSuffixActive)}>
            {suffix}
          </span>
        ) : null}
      </span>
    </div>
  )
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toProgress(value: number, min: number, max: number): number {
  if (max === min) return 0
  return clamp((value - min) / (max - min), 0, 1)
}

function fromProgress(progress: number, min: number, max: number): number {
  return min + progress * (max - min)
}

function quantize(value: number, min: number, max: number, step: number): number {
  const clamped = clamp(value, min, max)
  if (clamped === min || clamped === max) return clamped
  return clamp(Number((min + Math.round((clamped - min) / step) * step).toFixed(12)), min, max)
}

const styles = stylex.create({
  axisActive: {
    backgroundColor: 'oklch(100% 0 0 / 0.12)',
  },
  axisHorizontal: {
    backgroundColor: 'oklch(100% 0 0 / 0.08)',
    height: 1,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    translate: '0 -50%',
  },
  axisVertical: {
    backgroundColor: 'oklch(100% 0 0 / 0.08)',
    bottom: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    translate: '-50% 0',
    width: 1,
  },
  origin: {
    backgroundColor: 'oklch(86.4% 0.003 84.6 / 0.28)',
    borderRadius: '50%',
    height: 4,
    pointerEvents: 'none',
    position: 'absolute',
    translate: '-50% -50%',
    width: 4,
  },
  originActive: {
    backgroundColor: 'oklch(86.4% 0.003 84.6 / 0.48)',
  },
  pad: {
    backgroundColor: tokens.sliderTrackBg,
    borderRadius: 10,
    boxShadow:
      '0 1px 2px oklch(0% 0 0 / 0.07), 0 1px 1px oklch(0% 0 0 / 0.04), inset 0 1px 0 oklch(100% 0 0 / 0.045), inset 0 -1px 1px oklch(0% 0 0 / 0.32), inset 1px 0 1px oklch(100% 0 0 / 0.025)',
    cursor: 'grab',
    flexShrink: 0,
    height: 148,
    isolation: 'isolate',
    outline: '2px solid transparent',
    outlineOffset: 2,
    overflow: 'hidden',
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    width: '100%',
    ':focus-visible': {
      outline: `1px solid color-mix(in oklch, ${tokens.controlAccent} 28%, transparent)`,
    },
  },
  padActive: {
    cursor: 'grabbing',
  },
  readout: {
    alignItems: 'baseline',
    display: 'flex',
    flex: '1 1 0',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  readoutDigits: {
    color: 'oklch(86.4% 0.003 84.6 / 0.84)',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 500,
    lineHeight: 1,
  },
  readoutDigitsActive: {
    color: 'oklch(96% 0.003 84.6)',
  },
  readoutLabel: {
    color: 'oklch(86.4% 0.003 84.6 / 0.78)',
    fontSize: 12,
    fontWeight: 500,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  readoutSuffix: {
    color: 'oklch(86.4% 0.003 84.6 / 0.42)',
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
  },
  readoutSuffixActive: {
    color: 'oklch(96% 0.003 84.6 / 0.64)',
  },
  readoutValue: {
    alignItems: 'baseline',
    display: 'flex',
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
    gap: 0,
    userSelect: 'none',
  },
  readouts: {
    display: 'flex',
    gap: 16,
    minWidth: 0,
    paddingInline: 14,
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
    paddingBlock: 6,
  },
  thumb: {
    backgroundColor: 'oklch(52.46% 0 0)',
    borderRadius: '50%',
    boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 0.07), inset 0 -1px 1px oklch(0% 0 0 / 0.1)',
    height: 12,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    transition: 'background-color 140ms ease-out, box-shadow 140ms ease-out',
    width: 12,
    zIndex: 2,
  },
  thumbActive: {
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(180deg, oklch(100% 0 0) 0%, oklch(98.5% 0 0) 58%, oklch(95.6% 0 0) 100%)',
    boxShadow: `0 1px 1px color-mix(in oklch, ${tokens.controlAccent} 25%, transparent), 0 0 0 0.5px color-mix(in oklch, ${tokens.controlAccent} 65%, transparent), inset 0 1px 0 oklch(100% 0 0 / 0.78)`,
  },
})
