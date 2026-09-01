import type { MartianOrbSource } from './martian-orb.effect'

function loadImage(url: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load Martian ${label} texture: ${url}`))
    image.src = url
  })
}

export function createMartianSurfaceSource(
  albedoUrl: string,
  normalHeightUrl: string,
  longitudeOffsetDegrees = -75,
  heightRangeMeters: readonly [minimum: number, maximum: number] = [-8177, 21171],
): MartianOrbSource {
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
