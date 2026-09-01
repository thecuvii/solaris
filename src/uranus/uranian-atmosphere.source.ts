import type { UranianDataPlane, UranianOrbSource } from './uranian-orb.effect'

const WIDTH = 1024
const HEIGHT = 512
const SEED = 0x5552414e

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
  const unit = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return smooth(unit)
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

function generateAtmosphere(): UranianDataPlane {
  const data = new Uint8Array(WIDTH * HEIGHT * 4)

  for (let y = 0; y < HEIGHT; y += 1) {
    const latitude = (y / (HEIGHT - 1)) * Math.PI - Math.PI / 2
    const sineLatitude = Math.sin(latitude)
    const absoluteLatitudeDegrees = Math.abs((latitude * 180) / Math.PI)
    const equatorialTaper = 1 - sineLatitude * sineLatitude
    const hoodEligibility = smoothstep(40, 50, absoluteLatitudeDegrees)
    const methaneDepletion = smoothstep(30, 67, absoluteLatitudeDegrees)
    const broadBand = Math.sin(latitude * 8.5 + 0.4) * 0.035 + Math.sin(latitude * 19 - 0.7) * 0.014

    for (let x = 0; x < WIDTH; x += 1) {
      const broad = periodicNoise(x, y, 8, 5, SEED)
      const middle = periodicNoise(x, y, 19, 11, SEED ^ 0x9e3779b9)
      const fine = periodicNoise(x, y, 43, 23, SEED ^ 0x243f6a88)
      const lowFrequency =
        0.5 + broadBand + (broad - 0.5) * 0.12 * equatorialTaper + (middle - 0.5) * 0.035
      const upperHaze =
        0.18 +
        hoodEligibility * 0.34 +
        Math.max(0, middle - 0.58) * 0.18 * equatorialTaper +
        (fine - 0.5) * 0.025
      const depletion = 0.18 + methaneDepletion * 0.7 + (broad - 0.5) * 0.025
      const offset = (y * WIDTH + x) * 4
      data[offset] = quantize(lowFrequency)
      data[offset + 1] = quantize(upperHaze)
      data[offset + 2] = quantize(depletion)
      data[offset + 3] = quantize(hoodEligibility)
    }
  }

  return { data, height: HEIGHT, width: WIDTH }
}

export function createUranianAtmosphereSource(): UranianOrbSource {
  let atmosphere: UranianDataPlane | undefined
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
