// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'

import type { SourceLifecycleProps, SourceStatus } from '../source-lifecycle'
import { useSourceLifecycle } from './use-source-lifecycle'

type Source = { ready?: () => Promise<void> }

function Probe({ source, ...callbacks }: { source: Source } & SourceLifecycleProps) {
  useSourceLifecycle(source, callbacks)
  return null
}

function createCallbacks() {
  const statuses: SourceStatus[] = []
  return {
    onError: vi.fn<(error: Error) => void>(),
    onReady: vi.fn<() => void>(),
    onStatusChange: vi.fn<(status: SourceStatus) => void>((status) => {
      statuses.push(status)
    }),
    statuses,
  }
}

function deferred() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // Tell React that updates are wrapped in `act()` so it flushes synchronously.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

test('reports ready immediately for sources without a ready promise', async () => {
  const callbacks = createCallbacks()
  act(() => root.render(<Probe source={{}} {...callbacks} />))

  expect(callbacks.statuses).toEqual(['ready'])
  expect(callbacks.onReady).toHaveBeenCalledOnce()
  expect(callbacks.onError).not.toHaveBeenCalled()
})

test('transitions loading -> ready when the source resolves', async () => {
  const callbacks = createCallbacks()
  const pending = deferred()
  const source: Source = { ready: () => pending.promise }
  act(() => root.render(<Probe source={source} {...callbacks} />))

  expect(callbacks.statuses).toEqual(['loading'])
  expect(callbacks.onReady).not.toHaveBeenCalled()

  await act(async () => {
    pending.resolve()
    await pending.promise
  })

  expect(callbacks.statuses).toEqual(['loading', 'ready'])
  expect(callbacks.onReady).toHaveBeenCalledOnce()
  expect(callbacks.onError).not.toHaveBeenCalled()
})

test('transitions loading -> error and normalises non-Error rejections', async () => {
  const callbacks = createCallbacks()
  const pending = deferred()
  const source: Source = { ready: () => pending.promise }
  act(() => root.render(<Probe source={source} {...callbacks} />))

  await act(async () => {
    pending.reject('texture missing')
    await pending.promise.catch(() => undefined)
  })

  expect(callbacks.statuses).toEqual(['loading', 'error'])
  expect(callbacks.onReady).not.toHaveBeenCalled()
  expect(callbacks.onError).toHaveBeenCalledOnce()
  const [error] = callbacks.onError.mock.calls[0]!
  expect(error).toBeInstanceOf(Error)
  expect(error.message).toBe('texture missing')
})

test('ignores settlement after unmount or source change', async () => {
  const callbacks = createCallbacks()
  const first = deferred()
  const second = deferred()
  act(() => root.render(<Probe source={{ ready: () => first.promise }} {...callbacks} />))
  act(() => root.render(<Probe source={{ ready: () => second.promise }} {...callbacks} />))
  expect(callbacks.statuses).toEqual(['loading', 'loading'])

  await act(async () => {
    first.resolve()
    await first.promise
  })
  expect(callbacks.onReady).not.toHaveBeenCalled()

  // Unmount here so the pending `second` promise settles against a dead tree.
  act(() => root.unmount())
  root = createRoot(container)
  await act(async () => {
    second.resolve()
    await second.promise
  })
  expect(callbacks.statuses).toEqual(['loading', 'loading'])
  expect(callbacks.onReady).not.toHaveBeenCalled()
})

test('uses the latest callbacks without re-running the effect', async () => {
  const stale = createCallbacks()
  const fresh = createCallbacks()
  const pending = deferred()
  const source: Source = { ready: () => pending.promise }
  act(() => root.render(<Probe source={source} {...stale} />))
  act(() => root.render(<Probe source={source} {...fresh} />))

  await act(async () => {
    pending.resolve()
    await pending.promise
  })

  expect(stale.statuses).toEqual(['loading'])
  expect(fresh.statuses).toEqual(['ready'])
  expect(fresh.onReady).toHaveBeenCalledOnce()
})
