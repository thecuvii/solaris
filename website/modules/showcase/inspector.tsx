import { Button } from '@base-ui/react/button'
import { NumberField } from '@base-ui/react/number-field'
import { Slider } from '@base-ui/react/slider'
import { Switch } from '@base-ui/react/switch'
import * as stylex from '@stylexjs/stylex'
import NumberFlow, { continuous } from '@number-flow/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { getPrecision, numberFlowFormat, numberFlowTimings } from './setting-format'
import type { PlanetId } from './showcase-data'
import { parameterGroupsByPlanet, planetPresets } from '../planet-params/planet-params'
import type { ParameterDefinition } from '../planet-params/planet-params'
import {
  applyPlanetSettingsAtom,
  isDefaultPlanetAtom,
  resetPlanetSettingsAtom,
  settingAtom,
} from './showcase-settings'

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
    textAlign: 'center',
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
  resetButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(in oklch 180deg, color-mix(in oklch, var(--control-accent) 90%, white) 0%, color-mix(in oklch, var(--control-accent) 81%, black) 100%)',
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
    backgroundColor: 'var(--slider-progress-bg, oklch(32.86% 0 0))',
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
    backgroundColor: 'var(--slider-track-bg, oklch(20.07% 0 0))',
    borderRadius: 8,
    boxShadow:
      '0 1px 2px oklch(0% 0 0 / 0.07), 0 1px 1px oklch(0% 0 0 / 0.04), inset 0 1px 0 oklch(100% 0 0 / 0.045), inset 0 -1px 1px oklch(0% 0 0 / 0.32), inset 1px 0 1px oklch(100% 0 0 / 0.025)',
    height: 32,
    overflow: 'hidden',
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    width: '100%',
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
    backgroundColor: 'color-mix(in oklch, var(--control-accent) 72%, white)',
    boxShadow:
      'inset 0 1px 0 oklch(100% 0 0 / 0.22), 0 0 12px color-mix(in oklch, var(--control-accent) 28%, transparent)',
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
