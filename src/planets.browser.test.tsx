// Runs in real Chromium (see the `browser` project in vite.config.ts). Every
// planet is mounted with tiny synthetic textures and must compile its shaders,
// upload its source, and present a frame without reporting an error. The
// renderer core flips the canvas to `opacity: 1` only after the first
// successful draw, so that is the observable we wait for.

import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import * as solaris from './index'
import type { SourceStatus } from './source-lifecycle'

const FIRST_FRAME_TIMEOUT = 45_000

// Tell React that `act` is expected here; vitest's browser mode has no setup for it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function syntheticImage(width: number, height: number, seed: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas unavailable')
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, `hsl(${(seed * 47) % 360} 60% 40%)`)
  gradient.addColorStop(1, `hsl(${(seed * 47 + 120) % 360} 60% 60%)`)
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
  return canvas.toDataURL('image/png')
}

/** Equirectangular 2:1 maps; Mercury and Pluto validate the aspect ratio. */
const equirect = (seed: number) => syntheticImage(64, 32, seed)

const textures = {
  earth: {
    cloud: equirect(1),
    day: equirect(2),
    material: equirect(3),
    night: equirect(4),
    normal: equirect(5),
    roughness: equirect(6),
  },
  jupiter: { albedo: equirect(7) },
  mars: { albedo: equirect(8), normalHeight: equirect(9) },
  mercury: { albedo: equirect(10), normalHeight: equirect(11) },
  moon: { albedo: equirect(12), normalHeight: equirect(13) },
  pluto: { albedo: equirect(14), normalHeight: equirect(15) },
  saturn: { atmosphere: equirect(16), rings: syntheticImage(64, 4, 17) },
  // The AIA 304 source requires a 1024² observation frame.
  sun: { observation: syntheticImage(1024, 1024, 18) },
  venus: { cloudStructure: equirect(19) },
}

type Case = {
  name: string
  render: (lifecycle: {
    onError: (error: Error) => void
    onStatusChange: (status: SourceStatus) => void
  }) => ReactElement
  textured: boolean
}

const cases: Case[] = [
  {
    name: 'Earth',
    render: (p) => <solaris.Earth {...p} textures={textures.earth} />,
    textured: true,
  },
  {
    name: 'Jupiter',
    render: (p) => <solaris.Jupiter {...p} textures={textures.jupiter} />,
    textured: true,
  },
  {
    name: 'LunarEclipse',
    render: (p) => <solaris.LunarEclipse {...p} textures={textures.moon} />,
    textured: true,
  },
  { name: 'Mars', render: (p) => <solaris.Mars {...p} textures={textures.mars} />, textured: true },
  {
    name: 'Mercury',
    render: (p) => <solaris.Mercury {...p} textures={textures.mercury} />,
    textured: true,
  },
  { name: 'Moon', render: (p) => <solaris.Moon {...p} textures={textures.moon} />, textured: true },
  { name: 'Neptune', render: (p) => <solaris.Neptune {...p} />, textured: false },
  {
    name: 'Pluto',
    render: (p) => <solaris.Pluto {...p} textures={textures.pluto} />,
    textured: true,
  },
  {
    name: 'Saturn',
    render: (p) => <solaris.Saturn {...p} textures={textures.saturn} />,
    textured: true,
  },
  { name: 'Sky', render: (p) => <solaris.Sky onError={p.onError} />, textured: false },
  { name: 'Sun', render: (p) => <solaris.Sun {...p} textures={textures.sun} />, textured: true },
  { name: 'Titan', render: (p) => <solaris.Titan {...p} />, textured: false },
  { name: 'Uranus', render: (p) => <solaris.Uranus {...p} />, textured: false },
  {
    name: 'Venus',
    render: (p) => <solaris.Venus {...p} textures={textures.venus} />,
    textured: true,
  },
]

let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(element: ReactElement): HTMLDivElement {
  container = document.createElement('div')
  container.style.cssText = 'width: 320px; height: 320px; position: fixed; top: 0; left: 0;'
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(element))
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe.each(cases)('$name', ({ render, textured }) => {
  test('compiles, uploads and presents a frame without errors', async () => {
    const onError = vi.fn<(error: Error) => void>()
    const onStatusChange = vi.fn<(status: SourceStatus) => void>()
    const host = mount(render({ onError, onStatusChange }))

    const canvas = host.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas!.getContext('webgl2')).not.toBeNull()

    if (textured) {
      await expect
        .poll(() => onStatusChange.mock.calls.at(-1)?.[0], { timeout: 10_000 })
        .toBe('ready')
    }
    await expect
      .poll(() => canvas!.style.opacity, { interval: 50, timeout: FIRST_FRAME_TIMEOUT })
      .toBe('1')

    expect(onError).not.toHaveBeenCalled()
  })
})

test('a failing texture reports through onError instead of throwing', async () => {
  const onError = vi.fn<(error: Error) => void>()
  const onStatusChange = vi.fn<(status: SourceStatus) => void>()
  mount(
    <solaris.Mars
      onError={onError}
      onStatusChange={onStatusChange}
      textures={{
        albedo: 'data:image/png;base64,broken',
        normalHeight: textures.mars.normalHeight,
      }}
    />,
  )

  await expect.poll(() => onError.mock.calls.length, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(onStatusChange.mock.calls.at(-1)?.[0]).toBe('error')
  expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
})

test('paused planets do not present until resumed', async () => {
  function Wrapper({ paused }: { paused: boolean }) {
    return <solaris.Neptune paused={paused} />
  }
  const host = mount(<Wrapper paused />)
  const canvas = host.querySelector('canvas')!
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(canvas.style.opacity).toBe('0')

  act(() => root!.render(<Wrapper paused={false} />))
  await expect
    .poll(() => canvas.style.opacity, { interval: 50, timeout: FIRST_FRAME_TIMEOUT })
    .toBe('1')
})
