'use client'

import { useCallback, useMemo, useRef, type CSSProperties } from 'react'

import {
  createOrbRenderer,
  type OrbRendererInput,
  type OrbRendererSpec,
  type OrbSettingsBase,
  type OrbSource,
} from './orb-renderer'
import { useCanvasRenderer, type CreateCanvasRenderer } from './use-canvas-renderer'
import type { OrbCanvasProps } from '../orb'

export type OrbCanvasElementProps<
  Resources,
  Settings extends OrbSettingsBase,
  Surface,
> = OrbCanvasProps & {
  /** Background painted behind the planet. Defaults to transparent. */
  backgroundColor?: CSSProperties['backgroundColor']
  /** Per-frame settings; must include `lean`. */
  settings: Settings
  source: OrbSource<Surface> | undefined
  spec: OrbRendererSpec<Resources, Settings, Surface>
}

const canvasStyle: CSSProperties = { display: 'block', height: '100%', width: '100%' }

/**
 * Canvas shell shared by every planet: renders either a bare canvas or the
 * composition/viewport layout, and binds the spec to the renderer core.
 */
export function OrbCanvas<Resources, Settings extends OrbSettingsBase, Surface>({
  backgroundColor,
  className,
  composition,
  lean = true,
  onError,
  paused,
  settings,
  source,
  spec,
  style,
  viewport,
}: OrbCanvasElementProps<Resources, Settings, Surface>) {
  const compositionRef = useRef<HTMLDivElement>(null)
  const hasComposition = composition !== undefined

  // Layout mode changes which element receives pointer events, so it is part
  // of the renderer input and triggers a rebuild when toggled.
  const input = useMemo<OrbRendererInput<Surface>>(
    () => ({ compositionRef, hasComposition, source }),
    [hasComposition, source],
  )

  const createRenderer = useCallback<CreateCanvasRenderer<Settings, OrbRendererInput<Surface>>>(
    (canvas, rendererInput, getSettings, reportError) =>
      createOrbRenderer(canvas, rendererInput, spec, getSettings, reportError),
    [spec],
  )

  const canvasRef = useCanvasRenderer(settings, input, createRenderer, { onError, paused })
  const touchAction = lean ? 'pan-y' : undefined

  if (composition) {
    return (
      <div
        className={className}
        style={{ height: '100%', position: 'relative', width: '100%', ...style }}
      >
        <div
          aria-hidden="true"
          ref={compositionRef}
          style={{
            left: '50%',
            position: 'absolute',
            touchAction,
            transform: 'translateX(-50%)',
            ...composition,
          }}
        />
        <div
          style={{
            bottom: 0,
            left: 0,
            pointerEvents: 'none',
            position: 'absolute',
            right: 0,
            top: 0,
            ...viewport,
          }}
        >
          <canvas
            aria-hidden="true"
            height={1}
            ref={canvasRef}
            style={{ ...canvasStyle, backgroundColor, pointerEvents: 'none' }}
            width={1}
          />
        </div>
      </div>
    )
  }

  return (
    <canvas
      aria-hidden="true"
      className={className}
      height={1}
      ref={canvasRef}
      style={{ ...canvasStyle, backgroundColor, touchAction, ...style }}
      width={1}
    />
  )
}
