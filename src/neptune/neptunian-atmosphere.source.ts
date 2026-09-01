import type { NeptunianDataPlane, NeptunianOrbSource } from './neptunian-orb.effect'

const WIDTH = 1024
const HEIGHT = 512
const WIND_SAMPLES = 128
const SEED = 0x4e455054

function hash2(x: number, y: number, seed: number): number {
  let value = Math.imul(x ^ seed, 0x45d9f3b)
  value = Math.imul(value ^ y, 0x45d9f3b)
  value ^= value >>> 16
  return (value >>> 0) / 0xffffffff
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value)
}

function periodicNoise(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
): number {
  const scaledX = (x / WIDTH) * periodX
  const scaledY = (y / (HEIGHT - 1)) * periodY
  const cellX = Math.floor(scaledX)
  const cellY = Math.min(Math.floor(scaledY), periodY - 1)
  const localX = smooth(scaledX - cellX)
  const localY = smooth(scaledY - cellY)
  const nextX = (cellX + 1) % periodX
  const nextY = Math.min(cellY + 1, periodY)
  const currentX = ((cellX % periodX) + periodX) % periodX
  const top = hash2(currentX, cellY, seed) * (1 - localX) + hash2(nextX, cellY, seed) * localX
  const bottom = hash2(currentX, nextY, seed) * (1 - localX) + hash2(nextX, nextY, seed) * localX
  return top * (1 - localY) + bottom * localY
}

function quantize(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
}

function generateAtmosphere(): {
  highClouds: NeptunianDataPlane
  opticalDepth: NeptunianDataPlane
  zonalWind: NeptunianDataPlane
} {
  const opticalDepth = new Uint8Array(WIDTH * HEIGHT)
  const highClouds = new Uint8Array(WIDTH * HEIGHT)
  const cloudStreaks = Array.from({ length: 18 }, (_, index) => ({
    centerX: Math.floor(hash2(index, 11, SEED ^ 0x13c6ef37) * WIDTH),
    centerY: Math.floor((0.16 + hash2(index, 29, SEED ^ 0x6a09e667) * 0.68) * HEIGHT),
    radiusX: 20 + hash2(index, 43, SEED ^ 0xbb67ae85) * 54,
    radiusY: 2.5 + hash2(index, 61, SEED ^ 0x3c6ef372) * 6,
    strength: 0.5 + hash2(index, 79, SEED ^ 0xa54ff53a) * 0.5,
  }))

  for (let y = 0; y < HEIGHT; y += 1) {
    const latitude = (y / (HEIGHT - 1)) * 2 - 1
    const poleWeight = Math.max(0, 1 - latitude * latitude)
    const equatorialBand = Math.max(0, 1 - Math.abs(latitude) * 3.6)
    const temperateBand = Math.max(0, 1 - Math.abs(Math.abs(latitude) - 0.48) * 5.2)

    for (let x = 0; x < WIDTH; x += 1) {
      const index = y * WIDTH + x
      const broad = periodicNoise(x, y, 12, 7, SEED)
      const medium = periodicNoise(x, y, 28, 17, SEED ^ 0x51633e2d)
      const longitudeStructure = ((broad - 0.5) * 0.16 + (medium - 0.5) * 0.07) * poleWeight
      const deck = 0.52 + longitudeStructure + equatorialBand * 0.035 - temperateBand * 0.025
      opticalDepth[index] = quantize(deck)
    }
  }

  for (const cloud of cloudStreaks) {
    const firstRow = Math.max(Math.floor(cloud.centerY - cloud.radiusY), 0)
    const lastRow = Math.min(Math.ceil(cloud.centerY + cloud.radiusY), HEIGHT - 1)
    for (let y = firstRow; y <= lastRow; y += 1) {
      const latitude = (y / (HEIGHT - 1)) * 2 - 1
      const poleWeight = Math.max(0, 1 - latitude * latitude)
      const latitudeDistance = (y - cloud.centerY) / cloud.radiusY
      for (let x = 0; x < WIDTH; x += 1) {
        const directDistance = Math.abs(x - cloud.centerX)
        const longitudeDistance = Math.min(directDistance, WIDTH - directDistance) / cloud.radiusX
        const distanceSquared =
          longitudeDistance * longitudeDistance + latitudeDistance * latitudeDistance
        if (distanceSquared < 1) {
          const falloff = 1 - distanceSquared
          const index = y * WIDTH + x
          highClouds[index] = Math.max(
            highClouds[index],
            quantize(falloff * falloff * cloud.strength * poleWeight),
          )
        }
      }
    }
  }

  const zonalWind = new Uint8Array(WIND_SAMPLES)
  for (let index = 0; index < WIND_SAMPLES; index += 1) {
    const latitude = (index / (WIND_SAMPLES - 1)) * 2 - 1
    const latitudeSquared = latitude * latitude
    const polarTaper = Math.max(0, 1 - latitudeSquared * latitudeSquared * 0.18)
    const wind = (-0.94 * (1 - latitudeSquared) + 0.78 * latitudeSquared) * polarTaper
    zonalWind[index] = quantize(wind * 0.5 + 0.5)
  }

  return {
    highClouds: { data: highClouds, height: HEIGHT, width: WIDTH },
    opticalDepth: { data: opticalDepth, height: HEIGHT, width: WIDTH },
    zonalWind: { data: zonalWind, height: 1, width: WIND_SAMPLES },
  }
}

export function createNeptunianAtmosphereSource(): NeptunianOrbSource {
  let atmosphere: ReturnType<typeof generateAtmosphere> | undefined
  let pending: Promise<void> | undefined

  return {
    ready() {
      pending ??= Promise.resolve().then(() => {
        atmosphere = generateAtmosphere()
      })
      return pending
    },
    render() {
      return atmosphere
        ? {
            ...atmosphere,
            vortex: {
              angularRadiiDegrees: [13, 6],
              latitudeDegrees: -24,
              longitudeDegrees: -14,
            },
          }
        : null
    },
  }
}
