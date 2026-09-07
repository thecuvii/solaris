import { planets } from '../showcase/showcase-data'
import type { PlanetId } from '../showcase/showcase-data'

export type PlanetSettings = Record<string, boolean | number>

export type ParameterGroupId = 'atmosphere' | 'lighting' | 'motion' | 'pose' | 'rings' | 'surface'

export type ParameterDefinition =
  | {
      group: ParameterGroupId
      initial: boolean
      kind: 'boolean'
      label: string
      name: string
    }
  | {
      group: ParameterGroupId
      initial: number
      kind: 'number'
      label: string
      max: number
      min: number
      name: string
      step: number
      suffix?: string
    }

export type PlanetPreset = {
  id: string
  image: string
  label: string
  values: PlanetSettings
}

type ParamMeta = {
  group: ParameterGroupId
  label: string
}

const parameterGroups: readonly { id: ParameterGroupId; label: string }[] = [
  { id: 'motion', label: 'Motion' },
  { id: 'pose', label: 'Pose' },
  { id: 'surface', label: 'Surface' },
  { id: 'atmosphere', label: 'Atmosphere' },
  { id: 'lighting', label: 'Light' },
  { id: 'rings', label: 'Rings' },
]

function number(
  name: string,
  initial: number,
  min: number,
  max: number,
  step: number,
  { group, label, suffix }: ParamMeta & { suffix?: string },
): ParameterDefinition {
  return { group, initial, kind: 'number', label, max, min, name, step, suffix }
}

function amount(name: string, initial: number, meta: ParamMeta): ParameterDefinition {
  return number(name, initial, 0, 2, 0.01, meta)
}

function unit(name: string, initial: number, meta: ParamMeta): ParameterDefinition {
  return number(name, initial, 0, 1, 0.01, meta)
}

function angle(name: string, initial: number, meta: ParamMeta): ParameterDefinition {
  return number(name, initial, -180, 180, 1, { ...meta, suffix: '°' })
}

function tilt(name: string, initial: number, span: number, meta: ParamMeta): ParameterDefinition {
  return number(name, initial, -span, span, 1, { ...meta, suffix: '°' })
}

function percent(
  name: string,
  initialFraction: number,
  meta: ParamMeta & { max?: number },
): ParameterDefinition {
  return number(name, Number((initialFraction * 100).toFixed(1)), 0, meta.max ?? 100, 0.1, {
    group: meta.group,
    label: meta.label,
    suffix: '%',
  })
}

function angularSpeed(
  name: string,
  initialRadiansPerSecond: number,
  meta: ParamMeta & { max?: number; min?: number },
): ParameterDefinition {
  return number(name, spinDegrees(initialRadiansPerSecond), meta.min ?? -12, meta.max ?? 12, 0.1, {
    group: meta.group,
    label: meta.label,
    suffix: '°/s',
  })
}

function exposure(initial: number): ParameterDefinition {
  return number('exposure', initial, 0.4, 1.5, 0.01, { group: 'lighting', label: 'Exposure' })
}

function toggle(name: string, initial: boolean, meta: ParamMeta): ParameterDefinition {
  return { ...meta, initial, kind: 'boolean', name }
}

const lean = toggle('lean', true, { group: 'motion', label: 'Lean' })

const sunAzimuth = (initial: number, name = 'sunAzimuth'): ParameterDefinition =>
  angle(name, initial, { group: 'lighting', label: 'Sun azimuth' })

const sunElevation = (
  initial: number,
  name = 'sunElevation',
  bounds: { max?: number; min?: number } = {},
): ParameterDefinition =>
  number(name, initial, bounds.min ?? -90, bounds.max ?? 90, 1, {
    group: 'lighting',
    label: 'Sun elevation',
    suffix: '°',
  })

function spinDegrees(radiansPerSecond: number): number {
  return Number(((radiansPerSecond * 180) / Math.PI).toFixed(1))
}

const spin = (initial: number): ParameterDefinition =>
  number('spin', spinDegrees(initial), -6, 6, 0.1, {
    group: 'motion',
    label: 'Spin',
    suffix: '°/s',
  })

const yaw = (initial: number, name = 'yaw'): ParameterDefinition =>
  angle(name, initial, { group: 'pose', label: 'Yaw' })

const poseTilt = (initial: number, span = 30): ParameterDefinition =>
  tilt('tilt', initial, span, { group: 'pose', label: 'Tilt' })

export const parameterDefinitions: Record<PlanetId, readonly ParameterDefinition[]> = {
  earth: [
    amount('aerosol', 1, { group: 'atmosphere', label: 'Aerosol' }),
    amount('density', 1, { group: 'atmosphere', label: 'Density' }),
    number('atmosphereThickness', 0.16, 0, 0.5, 0.01, { group: 'atmosphere', label: 'Thickness' }),
    amount('cloudDensity', 1, { group: 'atmosphere', label: 'Clouds' }),
    percent('cloudHeight', 0.012, { group: 'atmosphere', label: 'Cloud height', max: 5 }),
    unit('cloudShadowIntensity', 0.48, { group: 'atmosphere', label: 'Cloud shadow' }),
    lean,
    amount('multipleScattering', 1, { group: 'atmosphere', label: 'Multiple scatter' }),
    number('cityLights', 1, 0, 3, 0.01, { group: 'lighting', label: 'City lights' }),
    amount('oceanGlint', 0.72, { group: 'surface', label: 'Ocean glint' }),
    amount('oceanWaveStrength', 0.8, { group: 'surface', label: 'Waves' }),
    angularSpeed('sunOrbit', 0.08, { group: 'motion', label: 'Sun orbit' }),
    spin(0.024),
    sunAzimuth(-41),
    sunElevation(8),
    yaw(0),
    poseTilt(0),
  ],
  jupiter: [
    unit('cloudPhotometricMix', 0.35, { group: 'surface', label: 'Photometric mix' }),
    unit('detailIntensity', 0.11, { group: 'surface', label: 'Detail' }),
    number('detailScale', 1, 0, 4, 0.01, { group: 'surface', label: 'Detail scale' }),
    angularSpeed('bandDrift', 0.055, { group: 'motion', label: 'Band drift' }),
    exposure(1.05),
    lean,
    unit('jetStrength', 0.65, { group: 'atmosphere', label: 'Jets' }),
    unit('limbHaze', 0.16, { group: 'atmosphere', label: 'Limb haze' }),
    percent('flattening', 0.0649, { group: 'pose', label: 'Flattening', max: 20 }),
    spin(0.025),
    sunAzimuth(-32),
    sunElevation(12),
    yaw(0),
    poseTilt(0),
    unit('vortexStrength', 0.42, { group: 'atmosphere', label: 'Vortices' }),
  ],
  mars: [
    unit('density', 0.22, { group: 'atmosphere', label: 'Density' }),
    poseTilt(8, 40),
    unit('blueAureole', 0.12, { group: 'atmosphere', label: 'Blue aureole' }),
    unit('dustAerosol', 0.36, { group: 'atmosphere', label: 'Dust' }),
    unit('dustDetail', 0.1, { group: 'surface', label: 'Dust grain' }),
    exposure(1.06),
    lean,
    number('normalStrength', 1.6, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    unit('photometricMix', 0.45, { group: 'surface', label: 'Photometric mix' }),
    spin(0.021),
    amount('reliefShadowStrength', 1, { group: 'surface', label: 'Relief shadow' }),
    sunAzimuth(-48),
    sunElevation(9),
    yaw(0),
  ],
  mercury: [
    exposure(0.92),
    lean,
    unit('microDetail', 0.08, { group: 'surface', label: 'Micro detail' }),
    number('normalStrength', 1.35, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    amount('photometricStrength', 1, { group: 'surface', label: 'Photometry' }),
    unit('reliefShadowStrength', 0.72, { group: 'surface', label: 'Relief shadow' }),
    spin(0.01),
    sunAzimuth(-12),
    sunElevation(14),
    yaw(0),
    poseTilt(0),
  ],
  moon: [
    amount('bloomIntensity', 0, { group: 'lighting', label: 'Bloom' }),
    unit('bloomRadius', 0.08, { group: 'lighting', label: 'Bloom radius' }),
    unit('bloomWarmth', 0.35, { group: 'lighting', label: 'Bloom warmth' }),
    number('earthshineIntensity', 6, 0, 50, 1, {
      group: 'lighting',
      label: 'Earthshine',
    }),
    exposure(0.72),
    lean,
    number('normalStrength', 0.85, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    unit('oppositionStrength', 0.25, { group: 'lighting', label: 'Opposition' }),
    number('oppositionWidth', 0.035, 0, 0.2, 0.005, {
      group: 'lighting',
      label: 'Opposition width',
    }),
    unit('photometricMix', 0.14, { group: 'surface', label: 'Photometric mix' }),
    unit('reliefShadowStrength', 0.58, { group: 'surface', label: 'Relief shadow' }),
    spin(0.012),
    sunAzimuth(-48),
    sunElevation(16),
    yaw(0),
    poseTilt(0),
    amount('veilingGlare', 0, { group: 'lighting', label: 'Veiling glare' }),
  ],
  'lunar-eclipse': [
    number('atmosphericOpticalDepth', 1.8, 0, 3, 0.01, {
      group: 'atmosphere',
      label: 'Optical depth',
    }),
    exposure(1.11),
    toggle('lean', false, { group: 'motion', label: 'Lean' }),
    number('haloIntensity', 2.1, 0, 3, 0.01, { group: 'lighting', label: 'Halo' }),
    number('haloWidth', 0.4, 0, 1, 0.01, { group: 'lighting', label: 'Halo width' }),
    number('normalStrength', 1.13, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    number('penumbraWidth', 1.15, 0, 2, 0.01, { group: 'lighting', label: 'Penumbra' }),
    number('refractedLightIntensity', 1.62, 0, 4, 0.01, {
      group: 'lighting',
      label: 'Refracted light',
    }),
    unit('reliefShadowStrength', 0.42, { group: 'surface', label: 'Relief shadow' }),
    sunAzimuth(-16),
    sunElevation(37),
    yaw(0),
    poseTilt(0),
    number('umbraRadius', 2.2, 0.5, 4, 0.01, { group: 'lighting', label: 'Umbra' }),
  ],
  neptune: [
    amount('cloudRelief', 1, { group: 'surface', label: 'Cloud relief' }),
    unit('companionCloud', 0.68, { group: 'atmosphere', label: 'Companion cloud' }),
    unit('deepOpticalDepth', 0.72, { group: 'atmosphere', label: 'Deep haze' }),
    exposure(0.72),
    lean,
    unit('flowDetail', 0.34, { group: 'atmosphere', label: 'Flow detail' }),
    unit('forwardScattering', 0.28, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('hazeOpticalDepth', 0.48, { group: 'atmosphere', label: 'Haze' }),
    unit('methaneAbsorption', 0.78, { group: 'atmosphere', label: 'Methane' }),
    percent('flattening', 0.017, { group: 'pose', label: 'Flattening', max: 12 }),
    spin(0.022),
    sunAzimuth(-10),
    sunElevation(5),
    yaw(0),
    unit('upperClouds', 0.68, { group: 'atmosphere', label: 'Upper clouds' }),
    unit('upperHaze', 0.3, { group: 'atmosphere', label: 'Upper haze' }),
    unit('vortexCirculation', 0.48, { group: 'atmosphere', label: 'Vortex flow' }),
    unit('vortexDarkness', 0.5, { group: 'atmosphere', label: 'Vortex dark' }),
    poseTilt(18, 40),
    unit('windScale', 0.62, { group: 'atmosphere', label: 'Wind' }),
  ],
  sky: [
    unit('cloudStreaks', 0, { group: 'atmosphere', label: 'Cloud streaks' }),
    unit('duskFlush', 0, { group: 'atmosphere', label: 'Dusk flush' }),
    number('exposure', 1.8, 0.2, 8, 0.05, { group: 'lighting', label: 'Exposure' }),
    unit('field', 0, { group: 'atmosphere', label: 'Field' }),
    amount('flare', 0.02, { group: 'lighting', label: 'Flare' }),
    angle('flareAngle', 63, { group: 'lighting', label: 'Flare angle' }),
    unit('flareRays', 0.56, { group: 'lighting', label: 'Flare rays' }),
    unit('flareStar', 0.25, { group: 'lighting', label: 'Flare star' }),
    amount('glare', 0.14, { group: 'lighting', label: 'Glare' }),
    unit('haze', 0.55, { group: 'atmosphere', label: 'Haze' }),
    amount('ozone', 0.69, { group: 'atmosphere', label: 'Ozone' }),
    number('saturation', 0.9, 0, 2, 0.01, { group: 'lighting', label: 'Saturation' }),
    number('refraction', 0.5, 0, 1.5, 0.01, { group: 'pose', label: 'Refraction' }),
    unit('seeingAmount', 0.29, { group: 'motion', label: 'Seeing' }),
    number('seeingSpeed', 0.76, 0, 3, 0.01, { group: 'motion', label: 'Seeing speed' }),
    number('streakDrift', 2.19, 0, 3, 0.01, { group: 'motion', label: 'Streak drift' }),
    sunElevation(3, 'sunElevation', { max: 70, min: -1 }),
    number('sunScale', 0.02, 0.02, 0.6, 0.005, { group: 'pose', label: 'Disc size' }),
  ],
  pluto: [
    exposure(1),
    lean,
    unit('hazeForwardScattering', 0.78, { group: 'atmosphere', label: 'Haze scatter' }),
    unit('hazeDensity', 0.28, { group: 'atmosphere', label: 'Haze' }),
    number('hazeThickness', 0.08, 0, 0.18, 0.01, { group: 'atmosphere', label: 'Haze depth' }),
    unit('iceResponse', 0.6, { group: 'surface', label: 'Ice' }),
    number('phaseFill', 0.035, 0, 0.25, 0.005, { group: 'lighting', label: 'Phase fill' }),
    amount('reliefShadowStrength', 0.85, { group: 'surface', label: 'Relief shadow' }),
    spin(0),
    unit('roughness', 0.78, { group: 'surface', label: 'Roughness' }),
    sunAzimuth(-38),
    sunElevation(16, 'sunElevation', { min: -30 }),
    yaw(0),
    amount('tholinStrength', 1, { group: 'surface', label: 'Tholins' }),
    poseTilt(25),
  ],
  saturn: [
    tilt('axialRoll', -8, 30, { group: 'pose', label: 'Roll' }),
    unit('bandContrast', 0.12, { group: 'surface', label: 'Bands' }),
    unit('cloudPhotometricMix', 0.42, { group: 'surface', label: 'Photometric mix' }),
    unit('detailIntensity', 0.06, { group: 'surface', label: 'Detail' }),
    angularSpeed('bandDrift', 0.018, { group: 'motion', label: 'Band drift', max: 6, min: -6 }),
    exposure(0.96),
    lean,
    unit('forwardScattering', 0.35, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('limbHaze', 0.1, { group: 'atmosphere', label: 'Limb haze' }),
    percent('flattening', 0.09796, { group: 'pose', label: 'Flattening', max: 20 }),
    unit('polarHexagon', 0.14, { group: 'surface', label: 'Hexagon' }),
    unit('ringOpacity', 1, { group: 'rings', label: 'Opacity' }),
    unit('ringShadowStrength', 0.82, { group: 'rings', label: 'Shadow' }),
    poseTilt(26, 45),
    spin(0.018),
    sunAzimuth(-38),
    sunElevation(-8),
    yaw(0),
    unit('unlitRingBrightness', 0.08, { group: 'rings', label: 'Unlit side' }),
  ],
  sun: [
    unit('activeRegionGain', 0.28, { group: 'surface', label: 'Active regions' }),
    number('contrast', 1.06, 0, 3, 0.01, { group: 'lighting', label: 'Contrast' }),
    exposure(1),
    lean,
    unit('filamentDepth', 0.42, { group: 'surface', label: 'Filaments' }),
    number('flowAmount', 1.6, 0, 32, 0.1, { group: 'motion', label: 'Flow amount' }),
    number('flowSpeed', 1, 0, 2, 0.01, { group: 'motion', label: 'Flow speed' }),
    amount('limbEmission', 1, { group: 'lighting', label: 'Limb' }),
    number('saturation', 1.04, 0, 2, 0.01, { group: 'lighting', label: 'Saturation' }),
    spin(0),
    yaw(0),
  ],
  titan: [
    unit('bandContrast', 0.28, { group: 'surface', label: 'Bands' }),
    unit('detachedHaze', 0.72, { group: 'atmosphere', label: 'Detached haze' }),
    exposure(1),
    amount('forwardScattering', 1, { group: 'atmosphere', label: 'Forward scatter' }),
    amount('hazeDensity', 1, { group: 'atmosphere', label: 'Haze' }),
    amount('hazeThickness', 1, { group: 'atmosphere', label: 'Haze depth' }),
    yaw(0),
    unit('polarHood', 0.34, { group: 'atmosphere', label: 'Polar hood' }),
    spin(0.012),
    sunAzimuth(-58),
    sunElevation(18, 'sunElevation', { max: 80, min: -80 }),
    poseTilt(8, 55),
  ],
  uranus: [
    unit('aerosolDepth', 0.72, { group: 'atmosphere', label: 'Aerosol' }),
    number('atmosphereThickness', 0.025, 0, 0.08, 0.005, {
      group: 'atmosphere',
      label: 'Thickness',
    }),
    unit('bandContrast', 0.13, { group: 'surface', label: 'Bands' }),
    unit('cloudContrast', 0.08, { group: 'atmosphere', label: 'Clouds' }),
    number('discStretch', 0.008, 0, 0.02, 0.001, {
      group: 'pose',
      label: 'Disc stretch',
    }),
    angle('stretchAngle', 0, { group: 'pose', label: 'Stretch angle' }),
    exposure(0.86),
    lean,
    unit('forwardScattering', 0.15, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('hazeDensity', 0.34, { group: 'atmosphere', label: 'Haze' }),
    number('hoodLatitude', 45, 25, 75, 1, {
      group: 'atmosphere',
      label: 'Hood latitude',
      suffix: '°',
    }),
    toggle('northHood', true, {
      group: 'atmosphere',
      label: 'North hood',
    }),
    number('hoodSoftness', 10, 2, 25, 1, {
      group: 'atmosphere',
      label: 'Hood softness',
      suffix: '°',
    }),
    unit('limbDarkening', 0.72, { group: 'lighting', label: 'Limb darkening' }),
    unit('methaneAbsorption', 0.58, { group: 'atmosphere', label: 'Methane' }),
    percent('flattening', 0.022927, { group: 'pose', label: 'Flattening', max: 8 }),
    number('phaseFill', 0.08, 0, 0.35, 0.01, { group: 'lighting', label: 'Phase fill' }),
    unit('polarHood', 0.26, { group: 'atmosphere', label: 'Polar hood' }),
    angle('poleAzimuth', -26, { group: 'pose', label: 'Pole azimuth' }),
    number('poleElevation', 38, -90, 90, 1, {
      group: 'pose',
      label: 'Pole elevation',
      suffix: '°',
    }),
    unit('ringShadow', 0.75, { group: 'rings', label: 'Shadow' }),
    number('ringVisibility', 4.5, 0, 8, 0.1, { group: 'rings', label: 'Visibility' }),
    spin(-0.008),
    sunAzimuth(-28),
    sunElevation(55),
    yaw(18),
    unit('windScale', 0.2, { group: 'atmosphere', label: 'Wind' }),
  ],
  venus: [
    poseTilt(-3),
    unit('cloudContrast', 0.3, { group: 'atmosphere', label: 'Contrast' }),
    unit('cloudDetail', 0.22, { group: 'atmosphere', label: 'Detail' }),
    exposure(1.08),
    lean,
    number('flowSpeed', 0.045, -0.15, 0.15, 0.005, { group: 'motion', label: 'Flow speed' }),
    unit('flowStrength', 0.7, { group: 'atmosphere', label: 'Flow strength' }),
    unit('forwardScattering', 0.72, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('gloryStrength', 0.18, { group: 'lighting', label: 'Glory' }),
    unit('opticalDepth', 0.72, { group: 'atmosphere', label: 'Optical depth' }),
    spin(-0.026),
    unit('sulfurTint', 0.72, { group: 'atmosphere', label: 'Sulfur' }),
    sunAzimuth(-52),
    sunElevation(9),
    yaw(0),
    unit('upperHaze', 0.46, { group: 'atmosphere', label: 'Upper haze' }),
  ],
}

export const initialSettings = Object.fromEntries(
  Object.entries(parameterDefinitions).map(([planetId, definitions]) => [
    planetId,
    Object.fromEntries(definitions.map((definition) => [definition.name, definition.initial])),
  ]),
) as Record<PlanetId, PlanetSettings>

function look(
  planetId: PlanetId,
  id: string,
  label: string,
  overrides: PlanetSettings = {},
): PlanetPreset {
  const image = `/thumbnails/v1/${planetId}-${id}.avif`
  return {
    id,
    image,
    label,
    values: { ...initialSettings[planetId], ...overrides },
  }
}

export const planetPresets: Record<PlanetId, readonly PlanetPreset[]> = {
  earth: [
    // Earth uses a different light convention: +90° faces the camera.
    // Stop the orbit so each preset keeps its intended phase.
    look('earth', 'studio', 'Day', {
      cityLights: 0,
      cloudDensity: 0.7,
      lean: false,
      sunOrbit: 0,
      sunAzimuth: 65,
      sunElevation: 20,
    }),
    look('earth', 'terminator', 'Dusk', {
      cityLights: 0.5,
      cloudDensity: 0.4,
      density: 1.4,
      lean: false,
      sunOrbit: 0,
      sunAzimuth: 0,
      sunElevation: 5,
    }),
    look('earth', 'night', 'Night', {
      cityLights: 3,
      cloudDensity: 0.3,
      density: 0.7,
      lean: false,
      sunOrbit: 0,
      sunAzimuth: -85,
      sunElevation: 10,
    }),
  ],
  jupiter: [
    look('jupiter', 'studio', 'Bands'),
    look('jupiter', 'grazing', 'Rim', {
      exposure: 1.15,
      limbHaze: 0.55,
      sunAzimuth: 130,
      sunElevation: -15,
      tilt: 25,
    }),
    look('jupiter', 'storm', 'Storm', {
      detailIntensity: 0.5,
      detailScale: 2,
      jetStrength: 1,
      sunAzimuth: 65,
      sunElevation: 20,
      tilt: -25,
      vortexStrength: 1,
      yaw: -20,
    }),
  ],
  mars: [
    look('mars', 'studio', 'Rust'),
    look('mars', 'dust-storm', 'Dust', {
      density: 1,
      dustAerosol: 1,
      dustDetail: 0.6,
      exposure: 1.15,
      normalStrength: 0.4,
      photometricMix: 0.8,
      sunAzimuth: 15,
      sunElevation: 20,
    }),
    look('mars', 'terminator', 'Ridge', {
      blueAureole: 0.8,
      density: 0.2,
      dustAerosol: 0.05,
      normalStrength: 2.8,
      reliefShadowStrength: 1.6,
      sunAzimuth: 95,
      sunElevation: 5,
    }),
  ],
  mercury: [
    look('mercury', 'studio', 'Craters', {
      normalStrength: 1.8,
      reliefShadowStrength: 0.9,
      sunAzimuth: -75,
      sunElevation: 10,
    }),
    look('mercury', 'raking', 'Rim', {
      exposure: 1.1,
      normalStrength: 2.4,
      reliefShadowStrength: 1,
      sunAzimuth: 135,
      sunElevation: -10,
    }),
    look('mercury', 'noon', 'Full', {
      exposure: 0.85,
      normalStrength: 0.6,
      photometricStrength: 1.6,
      reliefShadowStrength: 0.1,
      sunAzimuth: 0,
      sunElevation: 0,
      yaw: 70,
    }),
  ],
  moon: [
    look('moon', 'studio', 'Full', {
      exposure: 0.65,
      normalStrength: 0.7,
      oppositionStrength: 0.6,
      photometricMix: 0.05,
      sunAzimuth: 0,
      sunElevation: 0,
    }),
    look('moon', 'terminator', 'Half', {
      earthshineIntensity: 3,
      normalStrength: 1.25,
      reliefShadowStrength: 0.88,
      sunAzimuth: -90,
      sunElevation: 12,
    }),
    look('moon', 'earthshine', 'Glow', {
      bloomIntensity: 0.25,
      bloomRadius: 0.1,
      earthshineIntensity: 32,
      sunAzimuth: 140,
      sunElevation: -12,
    }),
  ],
  'lunar-eclipse': [
    look('lunar-eclipse', 'studio', 'Partial'),
    look('lunar-eclipse', 'umbra', 'Total', {
      atmosphericOpticalDepth: 2.6,
      haloIntensity: 0.3,
      refractedLightIntensity: 1.6,
      sunAzimuth: 0,
      sunElevation: 0,
      umbraRadius: 2.7,
    }),
    look('lunar-eclipse', 'grazing', 'Contact', {
      haloIntensity: 0.5,
      penumbraWidth: 0.45,
      sunAzimuth: -45,
      sunElevation: 15,
      umbraRadius: 1.7,
    }),
  ],
  neptune: [
    look('neptune', 'studio', 'Calm'),
    look('neptune', 'storm', 'Storm', {
      cloudRelief: 1.8,
      companionCloud: 1,
      flowDetail: 0.9,
      hazeOpticalDepth: 0.15,
      sunAzimuth: 65,
      sunElevation: 20,
      tilt: -30,
      vortexCirculation: 1,
      vortexDarkness: 1,
      windScale: 1,
    }),
    look('neptune', 'limb', 'Rim', {
      exposure: 1,
      forwardScattering: 0.9,
      hazeOpticalDepth: 0.85,
      sunAzimuth: 125,
      sunElevation: -15,
    }),
  ],
  sky: [
    look('sky', 'dawn', 'Dawn'),
    look('sky', 'hazy-dusk', 'Dusk', {
      cloudStreaks: 0.1,
      duskFlush: 0,
      exposure: 0.9,
      field: 1,
      glare: 0.2,
      haze: 0.85,
      ozone: 1.4,
      refraction: 1,
      saturation: 1,
      seeingAmount: 0.25,
      sunElevation: 1.8,
      sunScale: 0.36,
    }),
    look('sky', 'telephoto', 'Sunset', {
      cloudStreaks: 0.13,
      duskFlush: 0,
      exposure: 1.1,
      field: 1,
      flare: 0.04,
      flareAngle: 68,
      flareRays: 0.37,
      flareStar: 0.11,
      glare: 0.15,
      haze: 0.3,
      ozone: 0.8,
      saturation: 1,
      refraction: 1,
      seeingAmount: 0.6,
      seeingSpeed: 1,
      streakDrift: 0.19,
      sunElevation: 2,
      sunScale: 0.36,
    }),
    look('sky', 'noon-glare', 'Noon', {
      cloudStreaks: 0,
      duskFlush: 0,
      exposure: 8,
      field: 1,
      glare: 1.6,
      haze: 0.4,
      ozone: 1,
      refraction: 1,
      saturation: 1,
      seeingAmount: 0,
      sunElevation: 45,
      sunScale: 0.3,
    }),
    look('sky', 'lens-flare', 'Flare', {
      cloudStreaks: 0,
      duskFlush: 0,
      exposure: 4.5,
      field: 0.25,
      flare: 0.6,
      flareAngle: -120,
      flareRays: 0.3,
      glare: 0.5,
      haze: 0.42,
      ozone: 0.15,
      refraction: 1,
      saturation: 1.2,
      seeingAmount: 0.15,
      sunElevation: 3,
      sunScale: 0.025,
    }),
    look('sky', 'fog', 'Fog', {
      cloudStreaks: 0,
      duskFlush: 0.22,
      exposure: 0.45,
      field: 0.76,
      flare: 0.01,
      flareAngle: 2,
      flareRays: 0.46,
      flareStar: 0.42,
      glare: 0.47,
      haze: 1,
      ozone: 1.41,
      refraction: 1.01,
      saturation: 0.92,
      seeingAmount: 0.12,
      seeingSpeed: 0.39,
      streakDrift: 0.12,
      sunElevation: 7,
      sunScale: 0.035,
    }),
  ],
  pluto: [
    look('pluto', 'studio', 'Heart'),
    look('pluto', 'haze', 'Halo', {
      hazeDensity: 0.8,
      hazeForwardScattering: 1,
      hazeThickness: 0.14,
      phaseFill: 0.015,
      sunAzimuth: 145,
      sunElevation: 5,
    }),
  ],
  saturn: [
    look('saturn', 'studio', 'Rings'),
    look('saturn', 'open-rings', 'Polar', {
      axialRoll: 25,
      bandContrast: 0.45,
      polarHexagon: 1,
      tilt: 45,
      sunAzimuth: 20,
      sunElevation: 45,
    }),
    look('saturn', 'edge-on', 'Edge-on', {
      axialRoll: 0,
      exposure: 1.1,
      tilt: 3,
      sunAzimuth: 60,
      sunElevation: -15,
      unlitRingBrightness: 0.25,
    }),
  ],
  sun: [
    look('sun', 'studio', 'Ember'),
    look('sun', 'active', 'Flare', {
      activeRegionGain: 1,
      contrast: 1.3,
      exposure: 1.1,
      filamentDepth: 0.85,
      flowAmount: 18,
      flowSpeed: 1.4,
      limbEmission: 2,
      saturation: 1.15,
    }),
    look('sun', 'soft', 'Mono', {
      contrast: 0.65,
      exposure: 1.4,
      filamentDepth: 0.05,
      flowAmount: 0.4,
      limbEmission: 0.3,
      saturation: 0.1,
    }),
  ],
  titan: [
    look('titan', 'studio', 'Amber'),
    look('titan', 'thick-haze', 'Halo', {
      detachedHaze: 1,
      exposure: 1.2,
      forwardScattering: 2,
      hazeDensity: 1.6,
      hazeThickness: 1.8,
      sunAzimuth: 145,
      sunElevation: -12,
    }),
    look('titan', 'bands', 'Veil', {
      bandContrast: 1,
      detachedHaze: 0.1,
      hazeDensity: 0.25,
      polarHood: 0.9,
      sunAzimuth: 10,
      sunElevation: 30,
      tilt: -35,
    }),
  ],
  uranus: [
    look('uranus', 'studio', 'Cyan'),
    look('uranus', 'pole-on', 'Polar', {
      aerosolDepth: 0.2,
      bandContrast: 0.65,
      poleAzimuth: 0,
      poleElevation: 85,
      polarHood: 0.9,
      ringVisibility: 8,
      sunAzimuth: 0,
      sunElevation: 15,
    }),
    look('uranus', 'hood', 'Half', {
      atmosphereThickness: 0.07,
      forwardScattering: 0.8,
      hazeDensity: 0.7,
      phaseFill: 0.01,
      poleAzimuth: 65,
      poleElevation: 0,
      ringVisibility: 6,
      sunAzimuth: 130,
      sunElevation: 0,
    }),
  ],
  venus: [
    look('venus', 'studio', 'Pearl'),
    look('venus', 'sulfur', 'Sulfur', {
      cloudContrast: 0.9,
      cloudDetail: 0.8,
      flowStrength: 1,
      opticalDepth: 0.4,
      sulfurTint: 1,
      sunAzimuth: 10,
      sunElevation: 20,
      tilt: 25,
      upperHaze: 0.1,
    }),
    look('venus', 'glory', 'Halo', {
      forwardScattering: 1,
      gloryStrength: 0,
      opticalDepth: 1,
      sunAzimuth: 140,
      sunElevation: -5,
      upperHaze: 0.9,
    }),
  ],
}

export const parameterGroupsByPlanet = new Map(
  planets.map(
    ({ id }) =>
      [
        id,
        parameterGroups
          .map((group) => ({
            ...group,
            definitions: parameterDefinitions[id].filter(
              (definition) => definition.group === group.id,
            ),
          }))
          .filter((group) => group.definitions.length > 0),
      ] as const,
  ),
)

export function effectSettingValue(
  _definition: ParameterDefinition,
  value: boolean | number,
): boolean | number {
  return value
}

export function effectSettings(_planetId: PlanetId, settings: PlanetSettings): PlanetSettings {
  return settings
}
