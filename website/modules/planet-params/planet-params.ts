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
    unit('vortexStrength', 0.42, { group: 'atmosphere', label: 'Vortices' }),
  ],
  mars: [
    unit('density', 0.22, { group: 'atmosphere', label: 'Density' }),
    tilt('axialTilt', 8, 40, { group: 'pose', label: 'Axial tilt' }),
    unit('blueAureole', 0.12, { group: 'atmosphere', label: 'Blue aureole' }),
    unit('dustAerosol', 0.36, { group: 'atmosphere', label: 'Dust' }),
    unit('dustDetail', 0.1, { group: 'surface', label: 'Dust grain' }),
    exposure(1.06),
    lean,
    number('normalStrength', 1.6, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    unit('photometricMix', 0.45, { group: 'surface', label: 'Photometric mix' }),
    spin(0.021),
    amount('selfShadowStrength', 1, { group: 'surface', label: 'Self shadow' }),
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
    tilt('tilt', 0, 30, { group: 'pose', label: 'Tilt' }),
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
    amount('veilingGlare', 0, { group: 'lighting', label: 'Veiling glare' }),
  ],
  'lunar-eclipse': [
    number('atmosphericOpticalDepth', 1.18, 0, 3, 0.01, {
      group: 'atmosphere',
      label: 'Optical depth',
    }),
    exposure(1.18),
    lean,
    number('haloIntensity', 1.15, 0, 3, 0.01, { group: 'lighting', label: 'Halo' }),
    number('haloWidth', 0.23, 0, 1, 0.01, { group: 'lighting', label: 'Halo width' }),
    number('normalStrength', 0.82, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    number('penumbraWidth', 0.72, 0, 2, 0.01, { group: 'lighting', label: 'Penumbra' }),
    number('refractedLightIntensity', 1.7, 0, 4, 0.01, {
      group: 'lighting',
      label: 'Refracted light',
    }),
    unit('reliefShadowStrength', 0.36, { group: 'surface', label: 'Relief shadow' }),
    number('offsetX', 0.55, -3, 3, 0.01, { group: 'lighting', label: 'Offset X' }),
    number('offsetY', -1.55, -3, 3, 0.01, { group: 'lighting', label: 'Offset Y' }),
    yaw(0),
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
    tilt('weatherTilt', 18, 40, { group: 'pose', label: 'Weather tilt' }),
    unit('windScale', 0.62, { group: 'atmosphere', label: 'Wind' }),
  ],
  'observed-sun': [
    unit('cloudStreaks', 0, { group: 'atmosphere', label: 'Cloud streaks' }),
    unit('duskFlush', 1, { group: 'atmosphere', label: 'Dusk flush' }),
    number('exposure', 1.2, 0.2, 8, 0.05, { group: 'lighting', label: 'Exposure' }),
    unit('field', 0, { group: 'atmosphere', label: 'Field' }),
    amount('glare', 0.16, { group: 'lighting', label: 'Glare' }),
    unit('haze', 0.08, { group: 'atmosphere', label: 'Haze' }),
    amount('ozone', 0.4, { group: 'atmosphere', label: 'Ozone' }),
    number('saturation', 1.28, 0, 2, 0.01, { group: 'lighting', label: 'Saturation' }),
    number('refraction', 0, 0, 1.5, 0.01, { group: 'pose', label: 'Refraction' }),
    unit('seeingAmount', 0, { group: 'motion', label: 'Seeing' }),
    number('seeingSpeed', 1, 0, 3, 0.01, { group: 'motion', label: 'Seeing speed' }),
    number('streakDrift', 1, 0, 3, 0.01, { group: 'motion', label: 'Streak drift' }),
    sunElevation(3, 'sunElevation', { max: 70, min: -1 }),
    number('sunScale', 0.44, 0.1, 0.6, 0.01, { group: 'pose', label: 'Disc size' }),
  ],
  pluto: [
    exposure(1),
    lean,
    unit('hazeForwardScattering', 0.78, { group: 'atmosphere', label: 'Haze scatter' }),
    unit('hazeIntensity', 0.28, { group: 'atmosphere', label: 'Haze' }),
    number('hazeThickness', 0.08, 0, 0.18, 0.01, { group: 'atmosphere', label: 'Haze depth' }),
    unit('iceResponse', 0.6, { group: 'surface', label: 'Ice' }),
    number('phaseFill', 0.035, 0, 0.25, 0.005, { group: 'lighting', label: 'Phase fill' }),
    amount('reliefStrength', 0.85, { group: 'surface', label: 'Relief' }),
    spin(0),
    unit('roughness', 0.78, { group: 'surface', label: 'Roughness' }),
    sunAzimuth(-38),
    sunElevation(16, 'sunElevation', { min: -30 }),
    yaw(0),
    amount('tholinStrength', 1, { group: 'surface', label: 'Tholins' }),
    tilt('tilt', 25, 30, { group: 'pose', label: 'Tilt' }),
  ],
  saturn: [
    tilt('axialRoll', -8, 30, { group: 'pose', label: 'Roll' }),
    unit('bandContrast', 0.12, { group: 'surface', label: 'Bands' }),
    unit('cloudPhotometricMix', 0.42, { group: 'surface', label: 'Photometric mix' }),
    unit('detailIntensity', 0.06, { group: 'surface', label: 'Detail' }),
    angularSpeed('bandDrift', 0.018, { group: 'motion', label: 'Band drift', max: 6, min: -6 }),
    exposure(0.96),
    lean,
    unit('forwardScatter', 0.35, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('limbHaze', 0.1, { group: 'atmosphere', label: 'Limb haze' }),
    percent('flattening', 0.09796, { group: 'pose', label: 'Flattening', max: 20 }),
    unit('polarHexagon', 0.14, { group: 'surface', label: 'Hexagon' }),
    unit('ringOpacity', 1, { group: 'rings', label: 'Opacity' }),
    unit('ringShadowStrength', 0.82, { group: 'rings', label: 'Shadow' }),
    tilt('ringTilt', 26, 45, { group: 'rings', label: 'Tilt' }),
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
    unit('filamentDepth', 0.42, { group: 'surface', label: 'Filaments' }),
    number('flowAmount', 1.6, 0, 3, 0.01, { group: 'motion', label: 'Flow amount' }),
    number('flowSpeed', 1, 0, 2, 0.01, { group: 'motion', label: 'Flow speed' }),
    amount('limbEmission', 1, { group: 'lighting', label: 'Limb' }),
    number('saturation', 1.04, 0, 2, 0.01, { group: 'lighting', label: 'Saturation' }),
  ],
  titan: [
    unit('bandContrast', 0.28, { group: 'surface', label: 'Bands' }),
    unit('detachedHaze', 0.72, { group: 'atmosphere', label: 'Detached haze' }),
    exposure(1),
    amount('forwardScatteringStrength', 1, { group: 'atmosphere', label: 'Forward scatter' }),
    amount('hazeDensity', 1, { group: 'atmosphere', label: 'Haze' }),
    amount('hazeThickness', 1, { group: 'atmosphere', label: 'Haze depth' }),
    yaw(0),
    unit('polarHood', 0.34, { group: 'atmosphere', label: 'Polar hood' }),
    spin(0.012),
    sunAzimuth(-58),
    sunElevation(18, 'sunElevation', { max: 80, min: -80 }),
    number('latitude', 8, -55, 55, 1, {
      group: 'pose',
      label: 'Latitude',
      suffix: '°',
    }),
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
    unit('forwardScattering', 0.15, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('hazeOpacity', 0.34, { group: 'atmosphere', label: 'Haze' }),
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
    tilt('axialTilt', -3, 30, { group: 'pose', label: 'Axial tilt' }),
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
  return {
    id,
    image: `/thumbnails/v1/${planetId}.avif`,
    label,
    values: { ...initialSettings[planetId], ...overrides },
  }
}

export const planetPresets: Record<PlanetId, readonly PlanetPreset[]> = {
  earth: [
    look('earth', 'studio', 'Studio'),
    look('earth', 'terminator', 'Terminator', {
      cityLights: 0.35,
      sunAzimuth: -72,
      sunElevation: 3,
    }),
    look('earth', 'night', 'Night side', {
      cityLights: 2.15,
      sunAzimuth: -18,
      sunElevation: -14,
    }),
  ],
  jupiter: [
    look('jupiter', 'studio', 'Studio'),
    look('jupiter', 'grazing', 'Grazing', {
      jetStrength: 0.88,
      sunElevation: 4,
      vortexStrength: 0.62,
    }),
    look('jupiter', 'storm', 'Storm belt', {
      detailIntensity: 0.28,
      jetStrength: 0.9,
      vortexStrength: 0.78,
    }),
  ],
  mars: [
    look('mars', 'studio', 'Studio'),
    look('mars', 'dust-storm', 'Dust storm', {
      density: 0.58,
      dustAerosol: 0.84,
      photometricMix: 0.68,
    }),
    look('mars', 'terminator', 'Terminator', {
      normalStrength: 2.15,
      selfShadowStrength: 1.35,
      sunElevation: 3,
    }),
  ],
  mercury: [
    look('mercury', 'studio', 'Studio'),
    look('mercury', 'raking', 'Raking light', {
      normalStrength: 1.9,
      reliefShadowStrength: 0.94,
      sunElevation: 6,
    }),
    look('mercury', 'noon', 'High sun', {
      photometricStrength: 1.25,
      reliefShadowStrength: 0.28,
      sunElevation: 48,
    }),
  ],
  moon: [
    look('moon', 'studio', 'Studio'),
    look('moon', 'terminator', 'Terminator', {
      normalStrength: 1.25,
      reliefShadowStrength: 0.88,
      sunElevation: 5,
    }),
    look('moon', 'earthshine', 'Earthshine', {
      earthshineIntensity: 32,
      sunElevation: -10,
    }),
  ],
  'lunar-eclipse': [
    look('lunar-eclipse', 'studio', 'Studio'),
    look('lunar-eclipse', 'umbra', 'Deep umbra', {
      refractedLightIntensity: 2.1,
      offsetX: 0.08,
      offsetY: -0.12,
      umbraRadius: 2.7,
    }),
    look('lunar-eclipse', 'grazing', 'Grazing', {
      penumbraWidth: 1.15,
      offsetX: 1.45,
      offsetY: -0.4,
    }),
  ],
  neptune: [
    look('neptune', 'studio', 'Studio'),
    look('neptune', 'storm', 'Storm', {
      vortexCirculation: 0.82,
      vortexDarkness: 0.72,
      windScale: 0.9,
    }),
    look('neptune', 'limb', 'Limb', {
      forwardScattering: 0.55,
      hazeOpticalDepth: 0.7,
      sunElevation: 2,
    }),
  ],
  'observed-sun': [
    look('observed-sun', 'poster-dusk', 'Poster dusk'),
    look('observed-sun', 'hazy-dusk', 'Hazy dusk', {
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
    look('observed-sun', 'telephoto', 'Telephoto sunset', {
      cloudStreaks: 0.75,
      duskFlush: 0,
      exposure: 1.1,
      field: 1,
      glare: 0.15,
      haze: 0.3,
      ozone: 0.8,
      refraction: 1,
      saturation: 1,
      seeingAmount: 0.6,
      sunElevation: 2.2,
      sunScale: 0.36,
    }),
    look('observed-sun', 'noon-glare', 'Noon glare', {
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
  ],
  pluto: [
    look('pluto', 'studio', 'Studio'),
    look('pluto', 'haze', 'Hazy', {
      hazeIntensity: 0.58,
      hazeThickness: 0.16,
    }),
    look('pluto', 'ice', 'Icy', {
      iceResponse: 0.92,
      tholinStrength: 0.42,
    }),
  ],
  saturn: [
    look('saturn', 'studio', 'Studio'),
    look('saturn', 'open-rings', 'Open rings', {
      ringTilt: 34,
      sunElevation: 12,
    }),
    look('saturn', 'edge-on', 'Edge-on', {
      ringTilt: 3,
      unlitRingBrightness: 0.16,
    }),
  ],
  sun: [
    look('sun', 'studio', 'Studio'),
    look('sun', 'active', 'Active', {
      activeRegionGain: 0.72,
      contrast: 1.28,
      saturation: 1.18,
    }),
    look('sun', 'soft', 'Soft', {
      filamentDepth: 0.18,
      flowAmount: 0.9,
      saturation: 0.82,
    }),
  ],
  titan: [
    look('titan', 'studio', 'Studio'),
    look('titan', 'thick-haze', 'Thick haze', {
      detachedHaze: 0.92,
      hazeDensity: 1.45,
      hazeThickness: 1.35,
    }),
    look('titan', 'bands', 'Bands', {
      bandContrast: 0.52,
      hazeDensity: 0.55,
    }),
  ],
  uranus: [
    look('uranus', 'studio', 'Studio'),
    look('uranus', 'pole-on', 'Pole-on', {
      poleElevation: 82,
      polarHood: 0.48,
    }),
    look('uranus', 'hood', 'Hood', {
      hoodSoftness: 18,
      polarHood: 0.72,
    }),
  ],
  venus: [
    look('venus', 'studio', 'Studio'),
    look('venus', 'sulfur', 'Sulfur', {
      cloudContrast: 0.52,
      sulfurTint: 0.95,
    }),
    look('venus', 'glory', 'Glory', {
      gloryStrength: 0.46,
      sunElevation: 4,
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
