import type { PlutonianOrbSource } from './plutonian-orb.effect'
import { loadTextureImage } from '../texture-image'

export function createPlutonianSurfaceSource(
  albedoUrl: string,
  normalHeightUrl: string,
  heightRangeMeters: readonly [minimum: number, maximum: number] = [-4_101, 6_491],
): PlutonianOrbSource {
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
      return albedo && normalHeight ? { albedo, heightRangeMeters, normalHeight } : null
    },
  }
}
