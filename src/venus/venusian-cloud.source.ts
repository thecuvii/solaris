import type { VenusianOrbSource } from './venusian-orb.effect'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load Venus cloud texture: ${url}`))
    image.src = url
  })
}

export function createVenusianCloudSource(
  cloudStructureUrl: string,
  longitudeOffsetDegrees = 0,
): VenusianOrbSource {
  let cloudStructure: HTMLImageElement | undefined
  let pending: Promise<void> | undefined

  return {
    ready() {
      pending ??= loadImage(cloudStructureUrl).then((image) => {
        cloudStructure = image
      })
      return pending
    },
    render() {
      return cloudStructure ? { cloudStructure, longitudeOffsetDegrees } : null
    },
  }
}
