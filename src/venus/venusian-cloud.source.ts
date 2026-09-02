import type { VenusianOrbSource } from './venusian-orb.effect'
import { loadTextureImage } from '../texture-image'

export function createVenusianCloudSource(
  cloudStructureUrl: string,
  longitudeOffsetDegrees = 0,
): VenusianOrbSource {
  let cloudStructure: HTMLImageElement | undefined
  let pending: Promise<void> | undefined

  return {
    ready() {
      pending ??= loadTextureImage(cloudStructureUrl).then((image) => {
        cloudStructure = image
      })
      return pending
    },
    render() {
      return cloudStructure ? { cloudStructure, longitudeOffsetDegrees } : null
    },
  }
}
