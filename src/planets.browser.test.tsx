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
import { SolarOrbEffect } from './sun/solar-orb.effect'

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

test('Sun flow visibly advects broad plasma structure and respects zero controls', () => {
  // Broad structures catch the former high-pass-only subpixel shimmer. A fine
  // checkerboard would change even when the visible active regions stayed fixed.
  const data = new Uint8Array(1024 * 1024 * 4)
  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 1024; x++) {
      const offset = (y * 1024 + x) * 4
      data[offset] = 130 + 70 * Math.sin(x / 18) * Math.cos(y / 23)
      data[offset + 1] = 90 + 60 * Math.cos(x / 25 + y / 19)
      data[offset + 2] = 40
      const radius = Math.hypot(x - 512, y - 512)
      // Translucent off-limb emission must not breathe through alpha changes.
      data[offset + 3] = radius < 410 ? 255 : radius < 440 ? 128 : 0
    }
  }
  const source = {
    render: () => ({
      diskCenter: [0.5, 0.5] as const,
      diskRadius: 0.4,
      observation: { data, width: 1024, height: 1024 },
    }),
  }
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextId, callback)
    return nextId
  })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
  const onError = vi.fn<(error: Error) => void>()

  try {
    const host = mount(<SolarOrbEffect source={source} lean={false} onError={onError} />)
    const canvas = host.querySelector('canvas')!
    const gl = canvas.getContext('webgl2')!
    function readFrame(time: number) {
      const callbacks = [...frames.values()]
      frames.clear()
      for (const callback of callbacks) callback(time)
      const bytes = new Uint8Array(canvas.width * canvas.height * 4)
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
      // This source has an empty frame around the disc. Scan the four UV
      // boundaries, where divergent derivative-based LOD can leak coarse mips
      // on affected GPU drivers. Keep sampling inside and outside each edge.
      const frameRadius = Math.min(canvas.width, canvas.height) * 0.45
      let borderAlpha = 0
      let borderSamples = 0
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const edgeX = Math.abs(Math.abs(x + 0.5 - canvas.width / 2) - frameRadius)
          const edgeY = Math.abs(Math.abs(y + 0.5 - canvas.height / 2) - frameRadius)
          if (edgeX > 2 && edgeY > 2) continue
          borderAlpha += bytes[(y * canvas.width + x) * 4 + 3]
          borderSamples++
        }
      }
      expect(borderSamples).toBeGreaterThan(0)
      expect(borderAlpha).toBe(0)
      return bytes
    }
    readFrame(0)
    let time = 1000
    for (const [flowAmount, flowSpeed] of [
      [0, 2],
      [18, 0],
      [18, 1.4],
      [32, 2],
    ]) {
      act(() =>
        root!.render(
          <SolarOrbEffect
            source={source}
            lean={false}
            flowAmount={flowAmount}
            flowSpeed={flowSpeed}
            onError={onError}
          />,
        ),
      )
      const first = readFrame(time)
      const last = readFrame(time + 2000)
      time += 3000
      let delta = 0
      let samples = 0
      let alphaDelta = 0
      let translucentSamples = 0
      for (let i = 0; i < first.length; i += 4) {
        alphaDelta += Math.abs(first[i + 3] - last[i + 3])
        if (first[i + 3] > 0 && first[i + 3] < 255) translucentSamples++
        if (first[i + 3] !== 255) continue
        for (let channel = 0; channel < 3; channel++) {
          delta += Math.abs(first[i + channel] - last[i + channel])
          samples++
        }
      }
      expect(samples).toBeGreaterThan(0)
      expect(translucentSamples).toBeGreaterThan(0)
      expect(alphaDelta).toBe(0)
      if (flowAmount === 0 || flowSpeed === 0) expect(delta).toBe(0)
      else expect(delta / samples).toBeGreaterThan(5)
    }
    expect(onError).not.toHaveBeenCalled()
  } finally {
    act(() => root?.unmount())
    root = null
    request.mockRestore()
    cancel.mockRestore()
  }
})
