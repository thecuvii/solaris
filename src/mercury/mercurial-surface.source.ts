import type { MercurialOrbSource } from './mercurial-orb.effect'

function loadImage(url: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load Mercurial ${label} texture: ${url}`))
    image.src = url
  })
}

export function createMercurialSurfaceSource(
  albedoUrl: string,
  normalHeightUrl: string,
  heightRangeMeters: readonly [minimum: number, maximum: number] = [-10_764, 8_994],
  longitudeOffsetDegrees = 0,
): MercurialOrbSource {
  let albedo: HTMLImageElement | undefined
  let normalHeight: HTMLImageElement | undefined
  let pending: Promise<void> | undefined

  return {
    ready() {
      pending ??= Promise.all([
        loadImage(albedoUrl, 'albedo'),
        loadImage(normalHeightUrl, 'normal-height'),
      ]).then(([albedoImage, normalHeightImage]) => {
        albedo = albedoImage
        normalHeight = normalHeightImage
      })
      return pending
    },
    render() {
      return albedo && normalHeight
        ? { albedo, heightRangeMeters, longitudeOffsetDegrees, normalHeight }
        : null
    },
  }
}
