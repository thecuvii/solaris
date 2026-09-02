import type { MercurialOrbSource } from './mercurial-orb.effect'
import { loadTextureImage } from '../texture-image'

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
        loadTextureImage(albedoUrl),
        loadTextureImage(normalHeightUrl),
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
