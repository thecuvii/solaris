import type { JovianOrbSource } from './jovian-orb.effect'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load Jovian cloud texture: ${url}`))
    image.src = url
  })
}

export function createJovianCloudSource(
  albedoUrl: string,
  longitudeOffsetDegrees = -107,
  grsCenter: readonly [longitudeDegrees: number, latitudeDegrees: number] = [-107, -21],
  grsRadii: readonly [longitudeDegrees: number, latitudeDegrees: number] = [13, 6],
): JovianOrbSource {
  let albedo: HTMLImageElement | undefined
  let pending: Promise<void> | undefined

  return {
    ready() {
      pending ??= loadImage(albedoUrl).then((image) => {
        albedo = image
      })
      return pending
    },
    render() {
      return albedo ? { albedo, grsCenter, grsRadii, longitudeOffsetDegrees } : null
    },
  }
}
