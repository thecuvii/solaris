import type { AtmosphericOrbSource } from './atmospheric-orb.effect'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load Earth surface texture: ${url}`))
    image.src = url
  })
}

export function createEarthSurfaceSource(
  dayUrl: string,
  nightUrl: string,
  normalUrl: string,
  roughnessUrl: string,
  cloudUrl: string,
  materialUrl: string,
  longitudeOffsetDegrees = 0,
): AtmosphericOrbSource {
  let cloud: HTMLImageElement | undefined
  let day: HTMLImageElement | undefined
  let material: HTMLImageElement | undefined
  let night: HTMLImageElement | undefined
  let normal: HTMLImageElement | undefined
  let pending: Promise<void> | undefined
  let roughness: HTMLImageElement | undefined

  return {
    ready() {
      pending ??= Promise.all([
        loadImage(dayUrl),
        loadImage(nightUrl),
        loadImage(normalUrl),
        loadImage(roughnessUrl),
        loadImage(cloudUrl),
        loadImage(materialUrl),
      ]).then((images) => {
        day = images[0]
        night = images[1]
        normal = images[2]
        roughness = images[3]
        cloud = images[4]
        material = images[5]
      })
      return pending
    },
    render() {
      return day && night && normal && roughness && cloud && material
        ? { cloud, day, longitudeOffsetDegrees, material, night, normal, roughness }
        : null
    },
  }
}
