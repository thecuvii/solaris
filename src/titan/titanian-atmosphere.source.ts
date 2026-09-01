import type { TitanianDataPlane, TitanianOrbSource } from './titanian-orb.effect'

const WIDTH = 1024
const HEIGHT = 512
const SEED = 0x54495441

function hash2(x: number, y: number, seed: number): number {
  let value = Math.imul(x ^ seed, 0x45d9f3b)
  value = Math.imul(value ^ y, 0x45d9f3b)
  value ^= value >>> 16
  return (value >>> 0) / 0xffffffff
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  return smooth(Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0))))
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
  const wrappedX = ((cellX % periodX) + periodX) % periodX
  const nextX = (wrappedX + 1) % periodX
  const nextY = Math.min(cellY + 1, periodY)
  const top = hash2(wrappedX, cellY, seed) * (1 - localX) + hash2(nextX, cellY, seed) * localX
  const bottom = hash2(wrappedX, nextY, seed) * (1 - localX) + hash2(nextX, nextY, seed) * localX
  return top * (1 - localY) + bottom * localY
}

function quantize(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
}

function generateAtmosphere(): TitanianDataPlane {
  const data = new Uint8Array(WIDTH * HEIGHT * 4)

  for (let y = 0; y < HEIGHT; y += 1) {
    const latitude = (y / (HEIGHT - 1)) * Math.PI - Math.PI / 2
    const longitudeWeight = Math.cos(latitude) ** 2
    const northernLatitudeDegrees = (latitude * 180) / Math.PI
    const hoodEligibility = smoothstep(42, 72, northernLatitudeDegrees)
    const broadLatitude =
      Math.sin(latitude * 5.5 - 0.25) * 0.42 +
      Math.sin(latitude * 11.0 + 0.65) * 0.2 +
      Math.sin(latitude * 2.0 - 0.4) * 0.16

    for (let x = 0; x < WIDTH; x += 1) {
      const broad = periodicNoise(x, y, 7, 5, SEED)
      const middle = periodicNoise(x, y, 15, 9, SEED ^ 0x9e3779b9)
      const detached = periodicNoise(x, y, 11, 7, SEED ^ 0x243f6a88)
      const mainPerturbation =
        0.5 + ((broad - 0.5) * 0.15 + (middle - 0.5) * 0.045) * longitudeWeight
      const latitudeBasis = 0.5 + broadLatitude * 0.12 + (middle - 0.5) * 0.035 * longitudeWeight
      const detachedPerturbation = 0.5 + (detached - 0.5) * 0.13 * longitudeWeight
      const offset = (y * WIDTH + x) * 4
      data[offset] = quantize(mainPerturbation)
      data[offset + 1] = quantize(latitudeBasis)
      data[offset + 2] = quantize(detachedPerturbation)
      data[offset + 3] = quantize(hoodEligibility)
    }
  }

  return { data, height: HEIGHT, width: WIDTH }
}

export function createTitanianAtmosphereSource(): TitanianOrbSource {
  let atmosphere: TitanianDataPlane | undefined
  let pending: Promise<void> | undefined

  return {
    ready() {
      pending ??= Promise.resolve().then(() => {
        atmosphere = generateAtmosphere()
      })
      return pending
    },
    render() {
      return atmosphere ? { atmosphere } : null
    },
  }
}
