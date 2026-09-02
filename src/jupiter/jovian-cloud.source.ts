import type { JovianOrbSource } from './jovian-orb.effect'
import { loadTextureImage } from '../texture-image'

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
      pending ??= loadTextureImage(albedoUrl).then((image) => {
        albedo = image
      })
      return pending
    },
    render() {
      return albedo ? { albedo, grsCenter, grsRadii, longitudeOffsetDegrees } : null
    },
  }
}
