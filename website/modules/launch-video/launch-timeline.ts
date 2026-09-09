import { planetPresets } from '../planet-params/planet-params'

export const cutPlanets = ['moon', 'titan', 'venus', 'mercury', 'mars', 'jupiter', 'pluto'] as const
export const montageScale = 0.29
export const railScale = 0.29
export const montageCenterY = 0.55
export const cutStart = 4.6
export const railPlanets = [
  'earth',
  'titan',
  'venus',
  'mercury',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'sun',
  'pluto',
  'lunar-eclipse',
  'moon',
] as const
export const shadowPlanets = [
  'moon',
  'earth',
  'titan',
  'venus',
  'mercury',
  'mars',
  'jupiter',
  'pluto',
] as const
export const railDuration = 4.8
export const railHold = 0.2
export const shadowRoundFrames = [18, 12, 7] as const
export const blankStart = cutStart + railDuration + railHold
export const shadowStart = blankStart + 1
export const shadowEnd =
  shadowStart + shadowRoundFrames.reduce((sum, count) => sum + count * shadowPlanets.length, 0) / 30
export const pullbackStart = shadowEnd + 0.4
export const skyStart = 22.65
export const skyUiExitStart = 23.35
export const skyMorphStart = 24.2
export const skyMorphEnd = 30.2
export const sunToLogoStart = skyMorphEnd + 0.3
export const closingBlackStart = skyMorphEnd + 0.5
export const endCardStart = closingBlackStart + 0.5
export const shotDuration = endCardStart + 3.4

const skyLooks = [0, 2, 1, 5].map((index) => planetPresets.sky[index]!.values)

// Shape-preserving cubic interpolation keeps velocity continuous at preset joins.
function skyValue(key: string, position: number) {
  const values = skyLooks.map((look) => Number(look[key]))
  const index = Math.min(2, Math.floor(position))
  const u = position - index
  const slope = (i: number) => {
    if (i === 0) return values[1]! - values[0]!
    if (i === 3) return values[3]! - values[2]!
    const before = values[i]! - values[i - 1]!
    const after = values[i + 1]! - values[i]!
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after)
  }
  return (
    (2 * u * u * u - 3 * u * u + 1) * values[index]! +
    (u * u * u - 2 * u * u + u) * slope(index) +
    (-2 * u * u * u + 3 * u * u) * values[index + 1]! +
    (u * u * u - u * u) * slope(index + 1)
  )
}

export function skyAt(time: number) {
  const settings: Record<string, number> = {}
  for (const key of Object.keys(skyLooks[0]!)) {
    if (typeof skyLooks[0]![key] !== 'number') continue
    const delay = ['haze', 'field', 'cloudStreaks'].includes(key)
      ? 0.12
      : ['exposure', 'ozone', 'saturation', 'duskFlush'].includes(key)
        ? 0.22
        : 0
    const position = progress(time, skyMorphStart + delay, skyMorphEnd) * 3
    settings[key] = skyValue(key, position)
  }
  return {
    settings,
    opacity:
      progress(time, skyStart, skyStart + 0.28) *
      (1 - progress(time, sunToLogoStart, sunToLogoStart + 0.5)),
  }
}

export function uiExitAt(time: number, direction: string) {
  const delay = direction === 'right' ? 0.08 : direction === 'up' ? 0.16 : 0
  const u = Math.max(0, Math.min(1, (time - skyUiExitStart - delay) / 0.65))
  return u * u
}

export function settle(time: number, start: number, end: number) {
  const u = Math.max(0, Math.min(1, (time - start) / (end - start)))
  return 1 - (1 - u) ** 3
}

type FilmBody = (typeof railPlanets)[number]

export function progress(time: number, start: number, end: number) {
  const x = Math.max(0, Math.min(1, (time - start) / (end - start)))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function shadowClock(time: number) {
  let elapsed = Math.max(0, time - shadowStart)
  for (let round = 0; round < shadowRoundFrames.length; round++) {
    const duration = (shadowRoundFrames[round]! * shadowPlanets.length) / 30
    if (elapsed < duration) return { round, fraction: elapsed / duration }
    elapsed -= duration
  }
  return { round: shadowRoundFrames.length, fraction: 0 }
}

/** Two progressively faster passes, then a short hold on Moon. */
export function railTravel(time: number) {
  const u = Math.max(0, Math.min(1, (time - cutStart) / railDuration))
  return (railPlanets.length * 2 - 1) * (0.5 * u + 0.5 * u * u)
}

export function montageAt(time: number) {
  let body: FilmBody = 'earth'
  let opacity = 1
  const rail = time >= cutStart && time < blankStart
  if (rail) {
    body = railPlanets[Math.round(railTravel(time)) % railPlanets.length]!
  } else if (time >= blankStart && time < shadowStart) {
    opacity = 0
  } else if (time >= shadowStart && time < shadowEnd) {
    const clock = shadowClock(time)
    body =
      shadowPlanets[
        Math.min(shadowPlanets.length - 1, Math.floor(clock.fraction * shadowPlanets.length + 1e-8))
      ]!
    opacity = 1
  }
  return {
    body,
    opacity,
    rail,
    blackout: (time >= blankStart && time < shadowStart) || time >= closingBlackStart,
    earthOpacity: body === 'earth' ? opacity : 0,
    cutOpacity: opacity,
  }
}

// The introduction keeps its final light pose while the separate front-lit rail enters.
export function celestialMotion(time: number) {
  // Freeze the pose from the stopped rail through blackout and the opening beat.
  const yaw = (Math.min(time, blankStart - 0.1) + Math.max(0, time - shadowStart - 0.15)) * 1.8
  if (time < shadowStart) {
    return { yaw, sunAzimuth: -75, sunElevation: -30 }
  }
  const clock = shadowClock(time)
  const angle = -Math.PI * 2 * (clock.round + clock.fraction)
  // Constant grazing incidence keeps the terminator visible throughout each lap.
  const incidence = (progress(time, shadowStart + 0.15, shadowStart + 0.55) * 70 * Math.PI) / 180
  const side = Math.sin(incidence)
  const x = Math.cos(angle) * side
  const y = Math.sin(angle) * side
  const z = Math.cos(incidence)
  return {
    yaw,
    sunAzimuth: (Math.atan2(z, x) * 180) / Math.PI,
    sunElevation: (Math.asin(y) * 180) / Math.PI,
  }
}

export function shotAt(time: number) {
  const presetIndex = time < 0.75 ? 0 : time < 1.4 ? 2 : 1
  const preset = planetPresets.earth[presetIndex]!
  const light = progress(time, 2.2, 2.95)
  const cityLights = progress(time, 3.15, 3.8)
  const motion = celestialMotion(time)
  const montage = montageAt(time)
  return {
    presetIndex,
    pullback: settle(time, pullbackStart, pullbackStart + 0.75),
    reveal: settle(time, pullbackStart + 0.12, pullbackStart + 0.75),
    panel: progress(time, 1.95, 2.15),
    rail: montage.rail,
    blackout: montage.blackout,
    quickCut: montage.body === 'earth' ? null : montage.body,
    earthOpacity: montage.earthOpacity,
    cutOpacity: montage.cutOpacity,
    wordmarkOpacity: montage.opacity * (1 - progress(time, pullbackStart, pullbackStart + 0.55)),
    settings: {
      ...preset.values,
      lean: false,
      spin: 0,
      sunOrbit: 0,
      yaw: motion.yaw,
      sunAzimuth: mix(Number(preset.values.sunAzimuth), motion.sunAzimuth, light),
      sunElevation: mix(Number(preset.values.sunElevation), motion.sunElevation, light),
      cityLights: time < 1.95 ? Number(preset.values.cityLights) : 3 * cityLights,
      cloudDensity: Number(preset.values.cloudDensity),
    },
  }
}
