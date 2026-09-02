const imageCache = new Map<string, Promise<HTMLImageElement>>()
const settledImages = new WeakSet<Promise<HTMLImageElement>>()
const MAX_CACHED_IMAGES = 8

function trimImageCache(): void {
  if (imageCache.size <= MAX_CACHED_IMAGES) return

  for (const [url, image] of imageCache) {
    if (!settledImages.has(image)) continue
    imageCache.delete(url)
    if (imageCache.size <= MAX_CACHED_IMAGES) return
  }
}

export function loadTextureImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url)
  if (cached) {
    imageCache.delete(url)
    imageCache.set(url, cached)
    return cached
  }

  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error(`Texture images can only be loaded in a browser: ${url}`))
      return
    }

    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      image.decode().then(
        () => resolve(image),
        () => resolve(image),
      )
    }
    image.onerror = () => reject(new Error(`Unable to load texture: ${url}`))
    image.src = url
  }).catch((error: unknown) => {
    imageCache.delete(url)
    throw error
  })

  imageCache.set(url, pending)
  pending.then(
    () => {
      settledImages.add(pending)
      trimImageCache()
    },
    () => trimImageCache(),
  )
  trimImageCache()

  return pending
}

export async function preloadTextureImages(urls: Iterable<string>): Promise<void> {
  await Promise.all(Array.from(urls, loadTextureImage))
}
