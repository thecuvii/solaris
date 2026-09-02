import type { AtmosphericOrbSource } from './atmospheric-orb.effect'
import { loadTextureImage } from '../texture-image'

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
        loadTextureImage(dayUrl),
        loadTextureImage(nightUrl),
        loadTextureImage(normalUrl),
        loadTextureImage(roughnessUrl),
        loadTextureImage(cloudUrl),
        loadTextureImage(materialUrl),
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
