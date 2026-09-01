import type { LunarOrbSource } from './lunar-orb.effect'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load lunar surface texture: ${url}`))
    image.src = url
  })
}

export function createLunarSurfaceSource(
  albedoUrl: string,
  normalHeightUrl: string,
  longitudeOffsetDegrees = 0,
  heightScale = 22 / 1737.4,
): LunarOrbSource {
  let albedo: HTMLImageElement | undefined
  let normalHeight: HTMLImageElement | undefined
  let pending: Promise<void> | undefined

  return {
    ready() {
      pending ??= Promise.all([loadImage(albedoUrl), loadImage(normalHeightUrl)]).then((images) => {
        albedo = images[0]
        normalHeight = images[1]
      })
      return pending
    },
    render() {
      return albedo && normalHeight
        ? { albedo, heightScale, longitudeOffsetDegrees, normalHeight }
        : null
    },
  }
}
