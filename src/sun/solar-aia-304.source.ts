import type { SolarDataPlane, SolarOrbSource } from './solar-orb.effect'

function loadObservation(url: string): Promise<SolarDataPlane> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        reject(new Error('Unable to read the AIA 304 observation'))
        return
      }
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      resolve({
        data: new Uint8Array(pixels),
        height: canvas.height,
        width: canvas.width,
      })
    }
    image.onerror = () => reject(new Error(`Unable to load the AIA 304 observation: ${url}`))
    image.src = url
  })
}

export function createSolarAia304Source(observationUrl: string): SolarOrbSource {
  let observation: SolarDataPlane | undefined
  let pending: Promise<void> | undefined
  const diskCenter = [514.75 / 1024, 513.35 / 1024] as const
  const diskRadius = 403.75 / 1024

  return {
    ready() {
      pending ??= loadObservation(observationUrl).then((loadedObservation) => {
        observation = loadedObservation
      })
      return pending
    },
    render() {
      return observation ? { diskCenter, diskRadius, observation } : null
    },
  }
}
