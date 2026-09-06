import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'

// Minimal stand-in for `HTMLImageElement`: settles on the next microtask after
// `src` is assigned, failing for any URL that contains `fail`.
class FakeImage {
  crossOrigin = ''
  decoding = ''
  onerror: (() => void) | null = null
  onload: (() => void) | null = null
  #src = ''

  static created: FakeImage[] = []

  constructor() {
    FakeImage.created.push(this)
  }

  get src(): string {
    return this.#src
  }

  set src(value: string) {
    this.#src = value
    queueMicrotask(() => {
      if (value.includes('fail')) this.onerror?.()
      else this.onload?.()
    })
  }

  decode(): Promise<void> {
    return Promise.resolve()
  }
}

// Each test gets a fresh module so the internal cache starts empty.
async function importFresh() {
  vi.resetModules()
  return import('./texture-image')
}

beforeEach(() => {
  FakeImage.created = []
  vi.stubGlobal('Image', FakeImage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('rejects outside a browser', async () => {
  vi.unstubAllGlobals()
  const { loadTextureImage } = await importFresh()
  await expect(loadTextureImage('https://example.com/a.webp')).rejects.toThrow(
    'Texture images can only be loaded in a browser',
  )
})

test('resolves the decoded image with anonymous CORS', async () => {
  const { loadTextureImage } = await importFresh()
  const image = await loadTextureImage('https://example.com/a.webp')
  expect(image).toBeInstanceOf(FakeImage)
  expect(image.crossOrigin).toBe('anonymous')
  expect(image.src).toBe('https://example.com/a.webp')
})

test('dedupes concurrent and repeated loads of the same url', async () => {
  const { loadTextureImage } = await importFresh()
  const first = loadTextureImage('https://example.com/a.webp')
  const second = loadTextureImage('https://example.com/a.webp')
  expect(second).toBe(first)
  await first
  expect(loadTextureImage('https://example.com/a.webp')).toBe(first)
  expect(FakeImage.created).toHaveLength(1)
})

test('drops failed loads from the cache so they can be retried', async () => {
  const { loadTextureImage } = await importFresh()
  await expect(loadTextureImage('https://example.com/fail.webp')).rejects.toThrow(
    'Unable to load texture',
  )
  void loadTextureImage('https://example.com/fail.webp').catch(() => undefined)
  expect(FakeImage.created).toHaveLength(2)
})

test('evicts the least recently used settled images beyond the cache limit', async () => {
  const { loadTextureImage } = await importFresh()
  const urls = Array.from({ length: 9 }, (_, index) => `https://example.com/${index}.webp`)
  const first = await loadTextureImage(urls[0]!)
  for (const url of urls.slice(1)) await loadTextureImage(url)

  // Nine settled entries exceed the limit of eight, so the oldest is gone.
  expect(FakeImage.created).toHaveLength(9)
  const reloaded = await loadTextureImage(urls[0]!)
  expect(reloaded).not.toBe(first)
  expect(FakeImage.created).toHaveLength(10)
})

test('preloadTextureImages resolves once every url has loaded', async () => {
  const { loadTextureImage, preloadTextureImages } = await importFresh()
  await preloadTextureImages(['https://example.com/a.webp', 'https://example.com/b.webp'])
  expect(FakeImage.created).toHaveLength(2)
  await loadTextureImage('https://example.com/b.webp')
  expect(FakeImage.created).toHaveLength(2)
})
