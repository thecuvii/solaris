import { Button } from '@base-ui/react/button'
import { NumberField } from '@base-ui/react/number-field'
import { PreviewCard } from '@base-ui/react/preview-card'
import { Slider } from '@base-ui/react/slider'
import { Switch } from '@base-ui/react/switch'
import * as stylex from '@stylexjs/stylex'
import NumberFlow, { continuous } from '@number-flow/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { hapticPress, hapticTick } from './haptics'
import { tokens } from './tokens.stylex'
import { PosePad, splitOffsetPad, splitPosePad, XyPad } from './pose-pad'
import { getPrecision, numberFlowFormat, numberFlowTimings } from './setting-format'
import { useMobileShowcase } from './use-mobile-showcase'
import type { PlanetId } from './showcase-data'
import { parameterGroupsByPlanet, planetPresets } from '../planet-params/planet-params'
import type { ParameterDefinition, ParameterGroupId } from '../planet-params/planet-params'
import {
  applyPlanetSettingsAtom,
  isDefaultPlanetAtom,
  resetPlanetSettingsAtom,
  setSliderGestureAtom,
  settingAtom,
} from './showcase-settings'
import { track } from './track'

// Keys Base UI's slider thumb turns into value changes.
const SLIDER_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
])

export function Inspector({ planetId }: { planetId: PlanetId }) {
  const groups = parameterGroupsByPlanet.get(planetId) ?? []

  return (
    <>
      <div {...stylex.props(styles.inspectorGroups)}>
        <PresetGrid planetId={planetId} />
        {groups.map((group) => (
          <ParameterGroup
            key={group.id}
            definitions={group.definitions}
            id={group.id}
            label={group.label}
            planetId={planetId}
          />
        ))}
      </div>

      <ResetSettingsButton planetId={planetId} />
    </>
  )
}

function PresetGrid({ planetId }: { planetId: PlanetId }) {
  const applyPlanetSettings = useSetAtom(applyPlanetSettingsAtom)
  const presets = planetPresets[planetId]

  return (
    <section {...stylex.props(styles.parameterGroup)}>
      <div {...stylex.props(styles.groupHeading)}>
        <h2 data-sky-ink="" {...stylex.props(styles.groupTitle)}>
          Preset
        </h2>
      </div>
      <div aria-label="Preset" {...stylex.props(styles.presetGrid)}>
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => {
              track('clicked_preset', {
                planet_id: planetId,
                preset_id: preset.id,
                preset_label: preset.label,
              })
              applyPlanetSettings({ planetId, values: preset.values })
            }}
            type="button"
            {...stylex.props(styles.presetCard)}
          >
            <span {...stylex.props(styles.presetFrame)}>
              <img
                alt=""
                draggable={false}
                height={56}
                src={preset.image}
                width={56}
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
  id,
  label,
  planetId,
}: {
  definitions: readonly ParameterDefinition[]
  id: ParameterGroupId
  label: string
  planetId: PlanetId
}) {
  const pose = splitPosePad(definitions)
  const offset = splitOffsetPad(pose.rest)

  return (
    <section {...stylex.props(styles.parameterGroup)}>
      <div {...stylex.props(styles.groupHeading)}>
        <h2 data-sky-ink="" {...stylex.props(styles.groupTitle)}>
          {label}
        </h2>
        {id === 'pose' && planetId === 'pluto' ? <PlutoCoverageHelp /> : null}
      </div>
      <div {...stylex.props(styles.controlGroup)}>
        {pose.pad ? <PosePad planetId={planetId} tilt={pose.pad.tilt} yaw={pose.pad.yaw} /> : null}
        {offset.pad ? <XyPad invert planetId={planetId} x={offset.pad.x} y={offset.pad.y} /> : null}
        {offset.rest.map((definition) => (
          <ParameterControl key={definition.name} definition={definition} planetId={planetId} />
        ))}
      </div>
    </section>
  )
}

function PlutoCoverageHelp() {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        closeDelay={150}
        delay={200}
        render={<button type="button" />}
        {...stylex.props(styles.groupHelpTrigger)}
      >
        what's this?
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          align="start"
          side="left"
          sideOffset={8}
          {...stylex.props(styles.groupHelpPositioner)}
        >
          <PreviewCard.Popup {...stylex.props(styles.groupHelpPopup)}>
            <p {...stylex.props(styles.groupHelpCopy)}>
              New Horizons never mapped the whole globe. Unobserved terrain is a low-frequency fill
              with no relief, so yaw and tilt onto that side look soft.
            </p>
            <p {...stylex.props(styles.groupHelpCopy)}>
              That is missing coverage, not a shader blur.
            </p>
            <a
              href="https://www.jpl.nasa.gov/images/pia11707-pluto-color-map/"
              rel="noreferrer"
              target="_blank"
              {...stylex.props(styles.groupHelpLink)}
            >
              Learn more
            </a>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
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

export const ParameterSwitch = memo(function ParameterSwitch({
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

function dodgeHandleOpacity(
  progress: number,
  labelEnd = 0.3,
  valueStart = 0.78,
  fade = 0.05,
): number {
  return Math.min(
    Math.min(Math.max((progress - labelEnd) / fade, 0), 1),
    Math.min(Math.max((valueStart - progress) / fade, 0), 1),
  )
}

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
    axis: 'pending' | 'scroll' | 'slider'
    id: number
    moved: boolean
    startX: number
    startY: number
  } | null>(null)
  const interactingRef = useRef(false)
  const lastHapticValueRef = useRef(value)
  const editingRef = useRef(false)
  const keyboardGestureRef = useRef(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animationRef = useRef<ReturnType<typeof animate> | null>(null)
  // Track geometry, measured only when the track or its labels resize, so the
  // per-tick math below never forces a synchronous layout.
  const trackRectRef = useRef<DOMRect | null>(null)
  const geometryRef = useRef({ labelEnd: 0.3, valueStart: 0.78 })
  const fadeRef = useRef(0.05)
  const progress = useMotionValue(getNormalizedValue(value))
  // Dialkit: handle is rest-hidden and only appears while active. CSS starts
  // at 0 so SSR / first paint cannot flash it.
  const handleOpacity = useMotionValue(0)
  const fillWidth = useTransform(progress, (current) => `${current * 100}%`)
  // The fill spans the whole track and slides left by (1 - p) track widths, so
  // a tick is a transform (paint-only) instead of a width change (layout). The
  // element is 10px wider than the track (content-box padding); the second
  // term cancels that so the slide is measured in track widths.
  const fillX = useTransform(
    progress,
    (current) => `calc(${current - 1} * 100% - ${current - 1} * 10px)`,
  )
  const [hovered, setHovered] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [focused, setFocused] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editArmed, setEditArmed] = useState(false)
  const [draftValue, setDraftValue] = useState<number | null>(value)
  const active = hovered || interacting || focused || editing
  const handleActiveRef = useRef(active)
  handleActiveRef.current = active
  const forceProgressHover = useMobileShowcase()
  const atMaximum = value >= max
  const setSliderGesture = useSetAtom(setSliderGestureAtom)

  function clearHoverTimer() {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  function setGestureActive(next: boolean) {
    interactingRef.current = next
    setInteracting(next)
    setSliderGesture(next)
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

    // Measured once per gesture (see handlePointerDown); every move after that
    // would otherwise force a synchronous layout on a page React just dirtied.
    const rect = (trackRectRef.current ??= track.getBoundingClientRect())
    const rawProgress = (clientX - rect.left) / Math.max(rect.width, 1)
    const nextProgress = clampValue(rawProgress, 0, 1)

    progress.set(nextProgress)

    const rawValue = min + nextProgress * (max - min)
    return click ? getClickValue(rawValue, nextProgress) : quantizeValue(rawValue)
  }

  const cancelGesture = useCallback(() => {
    if (!pointerRef.current) return
    pointerRef.current = null
    trackRectRef.current = null
    interactingRef.current = false
    setInteracting(false)
    setSliderGesture(false)
    animateTo(getNormalizedValue(value), 0.1)
  }, [animateTo, getNormalizedValue, setSliderGesture, value])

  function hapticForValue(nextValue: number) {
    if (!forceProgressHover) return
    const previous = lastHapticValueRef.current
    if (nextValue === previous) return
    lastHapticValueRef.current = nextValue
    if (nextValue <= min || nextValue >= max) {
      hapticTick(true)
      return
    }
    const stepCount = (max - min) / step
    if (stepCount <= 12) {
      hapticTick(false)
      return
    }
    const previousDecile = Math.round(getNormalizedValue(previous) * 10)
    const nextDecile = Math.round(getNormalizedValue(nextValue) * 10)
    if (previousDecile !== nextDecile) hapticTick(false)
  }

  function claimSlider(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.axis === 'slider') return
    pointer.axis = 'slider'
    event.currentTarget.setPointerCapture(event.pointerId)
    lastHapticValueRef.current = value
    setGestureActive(true)
    if (forceProgressHover) hapticPress()
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    animationRef.current?.stop()
    trackRectRef.current = event.currentTarget.getBoundingClientRect()
    // Every gesture starts pending; claimSlider is what flips it to 'slider'
    // (and captures the pointer, marks the gesture active). Touch stays
    // pending until the move direction is known so a vertical flick can
    // scroll the drawer. Mouse claims immediately — there is no competing pan.
    pointerRef.current = {
      axis: 'pending',
      id: event.pointerId,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    }
    if (event.pointerType !== 'touch') claimSlider(event)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId || pointer.axis === 'scroll') return

    if (pointer.axis === 'pending') {
      const dx = event.clientX - pointer.startX
      const dy = event.clientY - pointer.startY
      if (Math.hypot(dx, dy) < 8) return
      if (Math.abs(dy) > Math.abs(dx)) {
        pointer.axis = 'scroll'
        return
      }
      claimSlider(event)
    }

    if (
      !pointer.moved &&
      Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= 3
    ) {
      pointer.moved = true
    }
    if (!pointer.moved) return

    const nextValue = updateFromPointer(event.clientX, false)
    onValueChange(nextValue)
    hapticForValue(nextValue)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return
    pointerRef.current = null
    if (pointer.axis === 'scroll') return

    const nextValue = updateFromPointer(event.clientX, !pointer.moved)
    trackRectRef.current = null
    onValueChange(nextValue)
    hapticForValue(nextValue)
    setGestureActive(false)
    animateTo(getNormalizedValue(nextValue))
  }

  // Keyboard nudges arrive as key repeats. Hold the sky chrome ink for the
  // duration of the key press, the same way a pointer drag does.
  function handleKeyDownCapture(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (editingRef.current || keyboardGestureRef.current) return
    if (!SLIDER_KEYS.has(event.key)) return
    keyboardGestureRef.current = true
    setSliderGesture(true)
  }

  function releaseKeyboardGesture() {
    if (!keyboardGestureRef.current) return
    keyboardGestureRef.current = false
    setSliderGesture(false)
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

  const hasSyncedProgressRef = useRef(false)

  useEffect(() => {
    if (interactingRef.current || editingRef.current) return
    const nextProgress = getNormalizedValue(value)
    // First commit is already seeded on the motion value. Jump, don't spring,
    // or a bounce-y init reads as the handle/fill flickering into place.
    if (!hasSyncedProgressRef.current) {
      hasSyncedProgressRef.current = true
      progress.jump(nextProgress)
      setDraftValue(value)
      return
    }
    animateTo(nextProgress, 0.12)
    setDraftValue(value)
  }, [animateTo, getNormalizedValue, progress, value])

  useLayoutEffect(() => {
    // Positions are read only here, after layout, and normalised to the track
    // width so the per-tick update below is pure arithmetic. Layout (not
    // effect) so the first paint already has the measured dodge, not the
    // fallback — same idea as Dialkit measuring before the handle is shown.
    function measure() {
      const track = trackRef.current
      const labelElement = labelRef.current
      const valueElement = valueRef.current
      if (!track || !labelElement || !valueElement) return
      // NumberFlow / first layout can report 0-width text. Updating dodge
      // from that would show a handle that the next frame has to hide.
      if (labelElement.offsetWidth === 0 || valueElement.offsetWidth === 0) return
      const width = Math.max(track.offsetWidth, 1)
      geometryRef.current = {
        labelEnd: (labelElement.offsetLeft + labelElement.offsetWidth + 12) / width,
        valueStart: (valueElement.offsetLeft - 12) / width,
      }
      // Fade distance is 10px, expressed in the same normalised space.
      fadeRef.current = 10 / width
      updateHandleOpacity()
    }

    function updateHandleOpacity(current = progress.get()) {
      if (!handleActiveRef.current) {
        handleOpacity.set(0)
        return
      }
      const { labelEnd, valueStart } = geometryRef.current
      handleOpacity.set(dodgeHandleOpacity(current, labelEnd, valueStart, fadeRef.current))
    }

    measure()
    const stopListening = progress.on('change', updateHandleOpacity)
    // Fires after layout, so reading offsets inside it is free.
    const resizeObserver = new ResizeObserver(measure)
    if (trackRef.current) resizeObserver.observe(trackRef.current)
    if (labelRef.current) resizeObserver.observe(labelRef.current)
    if (valueRef.current) resizeObserver.observe(valueRef.current)

    return () => {
      stopListening()
      resizeObserver.disconnect()
    }
  }, [handleOpacity, progress])

  useLayoutEffect(() => {
    if (!active) {
      handleOpacity.set(0)
      return
    }
    const { labelEnd, valueStart } = geometryRef.current
    handleOpacity.set(dodgeHandleOpacity(progress.get(), labelEnd, valueStart, fadeRef.current))
  }, [active, handleOpacity, progress])

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
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocused(false)
            releaseKeyboardGesture()
          }
        }}
        onFocusCapture={() => setFocused(true)}
        onKeyDownCapture={handleKeyDownCapture}
        onKeyUpCapture={releaseKeyboardGesture}
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
            style={{ x: fillX }}
            {...stylex.props(
              styles.sliderIndicator,
              (forceProgressHover || active) && styles.sliderIndicatorActive,
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
                // Mobile: display only; keep it out of the focus order too.
                tabIndex={forceProgressHover ? -1 : undefined}
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
            {...stylex.props(
              styles.sliderThumb,
              (interacting || focused || editing) && styles.sliderThumbActive,
            )}
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

const styles = stylex.create({
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingBlock: 4,
    paddingInline: 0,
  },
  groupHeading: {
    alignItems: 'center',
    display: 'flex',
    gap: 8,
    height: 36,
    minWidth: 0,
    width: '100%',
  },
  groupHelpCopy: {
    margin: 0,
    textWrap: 'pretty',
  },
  groupHelpLink: {
    color: 'rgba(242, 232, 208, 0.78)',
    fontWeight: 550,
    textDecoration: {
      default: 'underline',
      ':hover': 'underline',
      ':focus-visible': 'underline',
    },
    textUnderlineOffset: 3,
    width: 'fit-content',
    ':focus-visible': {
      outline: 'none',
    },
  },
  groupHelpPopup: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 16px 40px rgba(0, 0, 0, 0.32)',
    boxSizing: 'border-box',
    color: 'rgba(242, 232, 208, 0.72)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    gap: 8,
    lineHeight: 1.5,
    maxWidth: 248,
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
  groupHelpPositioner: {
    zIndex: 200,
  },
  groupHelpTrigger: {
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
    fontFamily: 'var(--font-sans)',
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
  groupTitle: {
    color: 'var(--showcase-label-ink)',
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1,
    margin: 0,
    minWidth: 0,
  },
  inspectorGroups: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingTop: 0,
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
    fontFamily: 'var(--font-sans)',
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
    // Mobile: the value is a label only. Taps fall through to the slider track
    // and the input can never be focused, so no keyboard.
    '@media (max-width: 960px)': {
      pointerEvents: 'none',
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
    fontFamily: 'var(--font-sans)',
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
    fontFamily: 'var(--font-sans)',
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
    textAlign: 'center',
    width: 56,
    ':focus-visible': {
      outline: `1px solid color-mix(in oklch, ${tokens.controlAccent} 28%, transparent)`,
      outlineOffset: 2,
    },
  },
  presetFrame: {
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    borderRadius: 12,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.04)',
    boxSizing: 'border-box',
    display: 'block',
    height: 56,
    overflow: 'hidden',
    position: 'relative',
    width: 56,
  },
  presetGrid: {
    display: 'grid',
    gap: 10,
    gridTemplateColumns: 'repeat(auto-fill, 56px)',
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
  resetButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    backgroundImage: `linear-gradient(in oklch 180deg, color-mix(in oklch, ${tokens.controlAccent} 90%, white) 0%, color-mix(in oklch, ${tokens.controlAccent} 81%, black) 100%)`,
    borderRadius: 8,
    borderWidth: 0,
    boxShadow: {
      default: 'oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset',
      ':focus-visible': `oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset, 0 0 0 3px color-mix(in oklch, ${tokens.controlAccent} 22%, transparent)`,
    },
    boxSizing: 'border-box',
    color: 'oklch(86.4% 0.003 84.6)',
    cursor: 'pointer',
    display: 'flex',
    fontFamily: 'var(--font-sans)',
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
    backgroundColor: tokens.sliderProgressBg,
    borderRadius: 8,
    boxSizing: 'content-box',
    boxShadow:
      '0.5px 0 0.5px oklch(0% 0 0 / 0.1), inset 0 1px 0 oklch(100% 0 0 / 0.035), inset 0 -1px 1px oklch(0% 0 0 / 0.13)',
    height: '100%',
    left: 0,
    paddingRight: 10,
    position: 'absolute',
    top: 0,
    transition: 'background-color 140ms ease-out, box-shadow 140ms ease-out',
    // Full track width; progress is a translateX (see fillX), not a width.
    width: '100%',
    willChange: 'transform',
  },
  sliderIndicatorActive: {
    backgroundImage: `linear-gradient(90deg, transparent, color-mix(in oklch, ${tokens.controlAccent} 12%, transparent)), linear-gradient(180deg, color-mix(in oklch, ${tokens.controlAccent} 90%, white) 0%, color-mix(in oklch, ${tokens.controlAccent} 96%, white) 45%, color-mix(in oklch, ${tokens.controlAccent} 99%, black) 100%)`,
    boxShadow: `inset 0 1px 0 oklch(100% 0 0 / 0.12), inset 1px 0 0 oklch(100% 0 0 / 0.08), inset 0 -1px 1px oklch(0% 0 0 / 0.22), 0 3px 4px color-mix(in oklch, ${tokens.controlAccent} 16%, transparent), 0 1px 2px color-mix(in oklch, ${tokens.controlAccent} 8%, transparent)`,
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
    opacity: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 6,
    transition: 'box-shadow 140ms ease-out, opacity 150ms ease-out, transform 140ms ease-out',
    translate: '-50% 0',
    width: 4,
    zIndex: 2,
  },
  sliderThumbActive: {
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(180deg, oklch(100% 0 0) 0%, oklch(98.5% 0 0) 58%, oklch(95.6% 0 0) 100%)',
    boxShadow: `0 1px 1px color-mix(in oklch, ${tokens.controlAccent} 25%, transparent), 0 0 0 0.5px color-mix(in oklch, ${tokens.controlAccent} 65%, transparent), inset 0 1px 0 oklch(100% 0 0 / 0.78)`,
  },
  sliderTrack: {
    backgroundColor: tokens.sliderTrackBg,
    borderRadius: 8,
    boxShadow:
      '0 1px 2px oklch(0% 0 0 / 0.07), 0 1px 1px oklch(0% 0 0 / 0.04), inset 0 1px 0 oklch(100% 0 0 / 0.045), inset 0 -1px 1px oklch(0% 0 0 / 0.32), inset 1px 0 1px oklch(100% 0 0 / 0.025)',
    height: 32,
    overflow: 'hidden',
    position: 'relative',
    touchAction: 'pan-y',
    userSelect: 'none',
    width: '100%',
  },
  switchLabel: {
    alignItems: 'center',
    backgroundColor: tokens.sliderTrackBg,
    borderRadius: 8,
    boxShadow:
      '0 1px 2px oklch(0% 0 0 / 0.07), 0 1px 1px oklch(0% 0 0 / 0.04), inset 0 1px 0 oklch(100% 0 0 / 0.045), inset 0 -1px 1px oklch(0% 0 0 / 0.32), inset 1px 0 1px oklch(100% 0 0 / 0.025)',
    color: 'oklch(86.4% 0.003 84.6 / 0.72)',
    cursor: 'pointer',
    display: 'flex',
    fontSize: 13,
    fontWeight: 500,
    height: 32,
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 10,
    transition: 'background-color 140ms ease-out',
  },
  switchLabelCompact: {
    backgroundColor: 'transparent',
    boxShadow: 'none',
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
      boxShadow: `inset 0 1px 0 oklch(100% 0 0 / 0.12), 0 0 0 3px color-mix(in oklch, ${tokens.controlAccent} 22%, transparent)`,
      outline: 'none',
    },
  },
  switchRootChecked: {
    backgroundColor: `color-mix(in oklch, ${tokens.controlAccent} 72%, white)`,
    boxShadow: `inset 0 1px 0 oklch(100% 0 0 / 0.22), 0 0 12px color-mix(in oklch, ${tokens.controlAccent} 28%, transparent)`,
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
})
