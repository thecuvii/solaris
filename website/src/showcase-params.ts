import { planets } from './showcase-data'
import type { PlanetId } from './showcase-data'

export type PlanetSettings = Record<string, boolean | number>

export type ParameterGroupId = 'atmosphere' | 'lighting' | 'motion' | 'rings' | 'surface' | 'view'

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
  { id: 'surface', label: 'Surface' },
  { id: 'atmosphere', label: 'Atmosphere' },
  { id: 'lighting', label: 'Light' },
  { id: 'motion', label: 'Motion' },
  { id: 'view', label: 'View' },
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

function speed(
  name: string,
  initial: number,
  meta: ParamMeta & { max?: number; min?: number },
): ParameterDefinition {
  return number(name, initial, meta.min ?? -0.1, meta.max ?? 0.1, 0.001, meta)
}

function exposure(initial: number): ParameterDefinition {
  return number('exposure', initial, 0.4, 1.5, 0.01, { group: 'lighting', label: 'Exposure' })
}

function toggle(name: string, initial: boolean, meta: ParamMeta): ParameterDefinition {
  return { ...meta, initial, kind: 'boolean', name }
}

const sunAzimuth = (initial: number, name = 'sunAzimuth'): ParameterDefinition =>
  angle(name, initial, { group: 'lighting', label: 'Sun azimuth' })

const sunElevation = (initial: number, name = 'sunElevation'): ParameterDefinition =>
  number(name, initial, -90, 90, 1, { group: 'lighting', label: 'Sun elevation', suffix: '°' })

const rotation = (initial: number): ParameterDefinition =>
  speed('rotationSpeed', initial, { group: 'motion', label: 'Rotation' })

const longitude = (initial: number, name = 'surfaceRotation'): ParameterDefinition =>
  angle(name, initial, { group: 'view', label: 'Longitude' })

export const parameterDefinitions: Record<PlanetId, readonly ParameterDefinition[]> = {
  earth: [
    amount('aerosol', 1, { group: 'atmosphere', label: 'Aerosol' }),
    amount('atmosphereDensity', 1, { group: 'atmosphere', label: 'Density' }),
    number('atmosphereThickness', 0.16, 0, 0.5, 0.01, { group: 'atmosphere', label: 'Thickness' }),
    amount('cloudDensity', 1, { group: 'atmosphere', label: 'Clouds' }),
    number('cloudHeight', 0.012, 0, 0.05, 0.001, { group: 'atmosphere', label: 'Cloud height' }),
    unit('cloudShadowIntensity', 0.48, { group: 'atmosphere', label: 'Cloud shadow' }),
    toggle('manualOrbit', false, { group: 'motion', label: 'Manual orbit' }),
    amount('multipleScattering', 1, { group: 'atmosphere', label: 'Multiple scatter' }),
    number('nightLightIntensity', 1, 0, 3, 0.01, { group: 'lighting', label: 'City lights' }),
    amount('oceanGlint', 0.72, { group: 'surface', label: 'Ocean glint' }),
    amount('oceanWaveStrength', 0.8, { group: 'surface', label: 'Waves' }),
    speed('orbitSpeed', 0.08, { group: 'motion', label: 'Orbit', max: 0.2, min: -0.2 }),
    toggle('showAtmosphere', true, { group: 'atmosphere', label: 'Show atmosphere' }),
    sunAzimuth(-41.25),
    sunElevation(8),
  ],
  jupiter: [
    unit('cloudPhotometricMix', 0.35, { group: 'surface', label: 'Photometric mix' }),
    unit('detailIntensity', 0.11, { group: 'surface', label: 'Detail' }),
    number('detailScale', 1, 0, 4, 0.01, { group: 'surface', label: 'Detail scale' }),
    speed('detailSpeed', 0.055, { group: 'motion', label: 'Band drift', max: 0.2, min: -0.2 }),
    exposure(1.05),
    unit('jetStrength', 0.65, { group: 'atmosphere', label: 'Jets' }),
    unit('limbHaze', 0.16, { group: 'atmosphere', label: 'Limb haze' }),
    number('oblateness', 0.0649, 0, 0.2, 0.001, { group: 'view', label: 'Flattening' }),
    rotation(0.025),
    sunAzimuth(-32),
    sunElevation(12),
    longitude(0),
    unit('vortexStrength', 0.42, { group: 'atmosphere', label: 'Vortices' }),
  ],
  mars: [
    unit('atmosphereDensity', 0.22, { group: 'atmosphere', label: 'Density' }),
    angle('axialTilt', 8, { group: 'view', label: 'Axial tilt' }),
    unit('blueAureole', 0.12, { group: 'atmosphere', label: 'Blue aureole' }),
    unit('dustAerosol', 0.36, { group: 'atmosphere', label: 'Dust' }),
    unit('dustDetail', 0.1, { group: 'surface', label: 'Dust grain' }),
    exposure(1.06),
    number('normalStrength', 1.6, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    unit('photometricMix', 0.45, { group: 'surface', label: 'Photometric mix' }),
    rotation(0.021),
    amount('selfShadowStrength', 1, { group: 'surface', label: 'Self shadow' }),
    sunAzimuth(-48),
    sunElevation(9),
    longitude(0),
  ],
  mercury: [
    exposure(0.92),
    unit('microDetail', 0.08, { group: 'surface', label: 'Micro detail' }),
    number('normalStrength', 1.35, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    amount('photometricStrength', 1, { group: 'surface', label: 'Photometry' }),
    unit('reliefShadowStrength', 0.72, { group: 'surface', label: 'Relief shadow' }),
    rotation(0.01),
    sunAzimuth(-12),
    sunElevation(14),
    longitude(0),
    angle('viewTilt', 0, { group: 'view', label: 'Tilt' }),
  ],
  moon: [
    amount('bloomIntensity', 0, { group: 'lighting', label: 'Bloom' }),
    unit('bloomRadius', 0.08, { group: 'lighting', label: 'Bloom radius' }),
    unit('bloomWarmth', 0.35, { group: 'lighting', label: 'Bloom warmth' }),
    number('earthshineIntensity', 0.006, 0, 0.05, 0.001, {
      group: 'lighting',
      label: 'Earthshine',
    }),
    exposure(0.72),
    number('normalStrength', 0.85, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    unit('oppositionStrength', 0.25, { group: 'lighting', label: 'Opposition' }),
    number('oppositionWidth', 0.035, 0, 0.2, 0.001, {
      group: 'lighting',
      label: 'Opposition width',
    }),
    unit('photometricMix', 0.14, { group: 'surface', label: 'Photometric mix' }),
    unit('reliefShadowStrength', 0.58, { group: 'surface', label: 'Relief shadow' }),
    rotation(0.012),
    sunAzimuth(-48),
    sunElevation(16),
    longitude(0),
    amount('veilingGlare', 0, { group: 'lighting', label: 'Veiling glare' }),
  ],
  'lunar-eclipse': [
    number('atmosphericOpticalDepth', 1.18, 0, 3, 0.01, {
      group: 'atmosphere',
      label: 'Optical depth',
    }),
    exposure(1.18),
    number('haloIntensity', 1.15, 0, 3, 0.01, { group: 'lighting', label: 'Halo' }),
    number('haloWidth', 0.23, 0, 1, 0.01, { group: 'lighting', label: 'Halo width' }),
    number('normalStrength', 0.82, 0, 3, 0.01, { group: 'surface', label: 'Relief' }),
    number('penumbraWidth', 0.72, 0, 2, 0.01, { group: 'lighting', label: 'Penumbra' }),
    number('refractedLightIntensity', 1.7, 0, 4, 0.01, {
      group: 'lighting',
      label: 'Refracted light',
    }),
    unit('reliefShadowStrength', 0.36, { group: 'surface', label: 'Relief shadow' }),
    number('shadowOffsetX', 0.55, -3, 3, 0.01, { group: 'lighting', label: 'Shadow X' }),
    number('shadowOffsetY', -1.55, -3, 3, 0.01, { group: 'lighting', label: 'Shadow Y' }),
    longitude(0),
    number('umbraRadius', 2.2, 0.5, 4, 0.01, { group: 'lighting', label: 'Umbra' }),
  ],
  neptune: [
    amount('cloudRelief', 1, { group: 'surface', label: 'Cloud relief' }),
    unit('companionCloud', 0.68, { group: 'atmosphere', label: 'Companion cloud' }),
    unit('deepOpticalDepth', 0.72, { group: 'atmosphere', label: 'Deep haze' }),
    exposure(0.72),
    unit('flowDetail', 0.34, { group: 'atmosphere', label: 'Flow detail' }),
    unit('forwardScattering', 0.28, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('hazeOpticalDepth', 0.48, { group: 'atmosphere', label: 'Haze' }),
    unit('methaneAbsorption', 0.78, { group: 'atmosphere', label: 'Methane' }),
    number('oblateness', 0.017, 0, 0.2, 0.001, { group: 'view', label: 'Flattening' }),
    rotation(0.022),
    sunAzimuth(-10),
    sunElevation(5),
    longitude(0),
    unit('upperClouds', 0.68, { group: 'atmosphere', label: 'Upper clouds' }),
    unit('upperHaze', 0.3, { group: 'atmosphere', label: 'Upper haze' }),
    unit('vortexCirculation', 0.48, { group: 'atmosphere', label: 'Vortex flow' }),
    unit('vortexDarkness', 0.5, { group: 'atmosphere', label: 'Vortex dark' }),
    angle('weatherTilt', 18, { group: 'view', label: 'Weather tilt' }),
    unit('windScale', 0.62, { group: 'atmosphere', label: 'Wind' }),
  ],
  pluto: [
    exposure(1),
    unit('hazeForwardScattering', 0.78, { group: 'atmosphere', label: 'Haze scatter' }),
    unit('hazeIntensity', 0.28, { group: 'atmosphere', label: 'Haze' }),
    unit('hazeThickness', 0.08, { group: 'atmosphere', label: 'Haze depth' }),
    unit('iceResponse', 0.6, { group: 'surface', label: 'Ice' }),
    unit('phaseFill', 0.035, { group: 'lighting', label: 'Phase fill' }),
    amount('reliefStrength', 0.85, { group: 'surface', label: 'Relief' }),
    rotation(0),
    unit('roughness', 0.78, { group: 'surface', label: 'Roughness' }),
    sunAzimuth(-38),
    sunElevation(16),
    longitude(0),
    amount('tholinStrength', 1, { group: 'surface', label: 'Tholins' }),
    angle('viewTilt', 25, { group: 'view', label: 'Tilt' }),
  ],
  saturn: [
    angle('axialRoll', -8, { group: 'view', label: 'Roll' }),
    unit('bandContrast', 0.12, { group: 'surface', label: 'Bands' }),
    unit('cloudPhotometricMix', 0.42, { group: 'surface', label: 'Photometric mix' }),
    unit('detailIntensity', 0.06, { group: 'surface', label: 'Detail' }),
    speed('detailSpeed', 0.018, { group: 'motion', label: 'Band drift', max: 0.2, min: -0.2 }),
    exposure(0.96),
    unit('forwardScatter', 0.35, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('limbHaze', 0.1, { group: 'atmosphere', label: 'Limb haze' }),
    number('oblateness', 0.09796, 0, 0.2, 0.001, { group: 'view', label: 'Flattening' }),
    unit('polarHexagon', 0.14, { group: 'surface', label: 'Hexagon' }),
    unit('ringOpacity', 1, { group: 'rings', label: 'Opacity' }),
    unit('ringShadowStrength', 0.82, { group: 'rings', label: 'Shadow' }),
    angle('ringTilt', 26, { group: 'rings', label: 'Tilt' }),
    rotation(0.018),
    sunAzimuth(-38),
    sunElevation(-8),
    longitude(0),
    unit('unlitRingBrightness', 0.08, { group: 'rings', label: 'Unlit side' }),
  ],
  sun: [
    unit('activeRegionGain', 0.28, { group: 'surface', label: 'Active regions' }),
    number('contrast', 1.06, 0, 3, 0.01, { group: 'lighting', label: 'Contrast' }),
    exposure(1),
    unit('filamentDepth', 0.42, { group: 'surface', label: 'Filaments' }),
    number('flowAmount', 1.6, 0, 3, 0.01, { group: 'motion', label: 'Flow' }),
    number('flowSpeed', 1, -2, 2, 0.01, { group: 'motion', label: 'Flow speed' }),
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
    longitude(0, 'longitudeOffsetDegrees'),
    unit('polarHood', 0.34, { group: 'atmosphere', label: 'Polar hood' }),
    rotation(0.012),
    sunAzimuth(-58, 'sunAzimuthDegrees'),
    sunElevation(18, 'sunElevationDegrees'),
    number('viewLatitudeDegrees', 8, -90, 90, 1, {
      group: 'view',
      label: 'Latitude',
      suffix: '°',
    }),
  ],
  uranus: [
    unit('aerosolDepth', 0.72, { group: 'atmosphere', label: 'Aerosol' }),
    number('atmosphereThickness', 0.025, 0, 0.2, 0.001, {
      group: 'atmosphere',
      label: 'Thickness',
    }),
    unit('bandContrast', 0.13, { group: 'surface', label: 'Bands' }),
    unit('cloudContrast', 0.08, { group: 'atmosphere', label: 'Clouds' }),
    number('epsilonEccentricity', 0.00794, 0, 0.1, 0.001, {
      group: 'view',
      label: 'Disc stretch',
    }),
    angle('epsilonPeriapsis', 0, { group: 'view', label: 'Stretch angle' }),
    exposure(0.86),
    unit('forwardScattering', 0.15, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('hazeOpacity', 0.34, { group: 'atmosphere', label: 'Haze' }),
    number('hoodLatitude', 45, -90, 90, 1, {
      group: 'atmosphere',
      label: 'Hood latitude',
      suffix: '°',
    }),
    number('hoodPole', 1, -1, 1, 2, { group: 'atmosphere', label: 'Hood pole' }),
    number('hoodSoftness', 10, 0, 45, 1, {
      group: 'atmosphere',
      label: 'Hood softness',
      suffix: '°',
    }),
    unit('limbDarkening', 0.72, { group: 'lighting', label: 'Limb darkening' }),
    unit('methaneAbsorption', 0.58, { group: 'atmosphere', label: 'Methane' }),
    number('oblateness', 0.022927, 0, 0.2, 0.001, { group: 'view', label: 'Flattening' }),
    unit('phaseFill', 0.08, { group: 'lighting', label: 'Phase fill' }),
    unit('polarHood', 0.26, { group: 'atmosphere', label: 'Polar hood' }),
    angle('poleAzimuth', -26, { group: 'view', label: 'Pole azimuth' }),
    number('poleElevation', 38, -90, 90, 1, {
      group: 'view',
      label: 'Pole elevation',
      suffix: '°',
    }),
    unit('ringShadow', 0.75, { group: 'rings', label: 'Shadow' }),
    number('ringVisibility', 4.5, 0, 8, 0.1, { group: 'rings', label: 'Visibility' }),
    rotation(-0.008),
    sunAzimuth(-28),
    sunElevation(55),
    longitude(18),
    unit('windScale', 0.2, { group: 'atmosphere', label: 'Wind' }),
  ],
  venus: [
    angle('axialTilt', -3, { group: 'view', label: 'Axial tilt' }),
    unit('cloudContrast', 0.3, { group: 'atmosphere', label: 'Contrast' }),
    unit('cloudDetail', 0.22, { group: 'atmosphere', label: 'Detail' }),
    exposure(1.08),
    speed('flowSpeed', 0.045, { group: 'motion', label: 'Flow', max: 0.2, min: -0.2 }),
    unit('flowStrength', 0.7, { group: 'atmosphere', label: 'Flow strength' }),
    unit('forwardScattering', 0.72, { group: 'atmosphere', label: 'Forward scatter' }),
    unit('gloryStrength', 0.18, { group: 'lighting', label: 'Glory' }),
    unit('opticalDepth', 0.72, { group: 'atmosphere', label: 'Optical depth' }),
    rotation(-0.026),
    unit('sulfurTint', 0.72, { group: 'atmosphere', label: 'Sulfur' }),
    sunAzimuth(-52),
    sunElevation(9),
    longitude(0),
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
      nightLightIntensity: 0.35,
      sunAzimuth: -72,
      sunElevation: 3,
    }),
    look('earth', 'night', 'Night side', {
      nightLightIntensity: 2.15,
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
      atmosphereDensity: 0.58,
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
      earthshineIntensity: 0.032,
      sunElevation: -10,
    }),
  ],
  'lunar-eclipse': [
    look('lunar-eclipse', 'studio', 'Studio'),
    look('lunar-eclipse', 'umbra', 'Deep umbra', {
      refractedLightIntensity: 2.1,
      shadowOffsetX: 0.08,
      shadowOffsetY: -0.12,
      umbraRadius: 2.7,
    }),
    look('lunar-eclipse', 'grazing', 'Grazing', {
      penumbraWidth: 1.15,
      shadowOffsetX: 1.45,
      shadowOffsetY: -0.4,
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

export function matchPlanetPreset(planetId: PlanetId, settings: PlanetSettings): string | null {
  for (const preset of planetPresets[planetId]) {
    if (Object.entries(preset.values).every(([name, value]) => settings[name] === value)) {
      return preset.id
    }
  }
  return null
}
