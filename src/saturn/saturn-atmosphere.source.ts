import type { SaturnOrbSource } from './saturn-orb.effect'

function loadImage(url: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load Saturn ${label} texture: ${url}`))
    image.src = url
  })
}

export function createSaturnAtmosphereSource(
  atmosphereUrl: string,
  ringsUrl: string,
  longitudeOffsetDegrees = 0,
  ringRadiusRange: readonly [innerEquatorialRadii: number, outerEquatorialRadii: number] = [
    66900 / 60268,
    140500 / 60268,
  ],
): SaturnOrbSource {
  let atmosphere: HTMLImageElement | undefined
  let pending: Promise<void> | undefined
  let rings: HTMLImageElement | undefined

  return {
    ready() {
      pending ??= Promise.all([
        loadImage(atmosphereUrl, 'atmosphere'),
        loadImage(ringsUrl, 'ring data'),
      ]).then(([atmosphereImage, ringImage]) => {
        atmosphere = atmosphereImage
        rings = ringImage
      })
      return pending
    },
    render() {
      return atmosphere && rings
        ? { atmosphere, longitudeOffsetDegrees, ringRadiusRange, rings }
        : null
    },
  }
}
