import type { LunarOrbSource } from './lunar-orb.effect'
import { loadTextureImage } from '../texture-image'

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
      pending ??= Promise.all([
        loadTextureImage(albedoUrl),
        loadTextureImage(normalHeightUrl),
      ]).then((images) => {
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
