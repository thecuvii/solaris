import type { SaturnOrbSource } from './saturn-orb.effect'
import { loadTextureImage } from '../texture-image'

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
      pending ??= Promise.all([loadTextureImage(atmosphereUrl), loadTextureImage(ringsUrl)]).then(
        ([atmosphereImage, ringImage]) => {
          atmosphere = atmosphereImage
          rings = ringImage
        },
      )
      return pending
    },
    render() {
      return atmosphere && rings
        ? { atmosphere, longitudeOffsetDegrees, ringRadiusRange, rings }
        : null
    },
  }
}
