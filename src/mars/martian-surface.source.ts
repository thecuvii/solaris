import type { MartianOrbSource } from './martian-orb.effect'
import { loadTextureImage } from '../texture-image'

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
