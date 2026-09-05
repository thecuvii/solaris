import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

import type { PlanetId } from './showcase-data'
import { initialSettings, parameterDefinitions } from '../planet-params/planet-params'
import type { PlanetSettings } from '../planet-params/planet-params'

type SettingId = {
  name: string
  planetId: PlanetId
}

export const settingAtom = atomFamily(
  ({ name, planetId }: SettingId) => atom<boolean | number>(initialSettings[planetId][name]),
  (left, right) => left.planetId === right.planetId && left.name === right.name,
)

export const planetSettingsAtom = atomFamily((planetId: PlanetId) =>
  atom((get): PlanetSettings => {
    const settings: PlanetSettings = {}
    for (const { name } of parameterDefinitions[planetId]) {
      settings[name] = get(settingAtom({ name, planetId }))
    }
    return settings
  }),
)

export const isDefaultPlanetAtom = atomFamily((planetId: PlanetId) =>
  atom((get) =>
    parameterDefinitions[planetId].every(
      ({ initial, name }) => get(settingAtom({ name, planetId })) === initial,
    ),
  ),
)

export const eclipseHaloAtom = atom((get) => ({
  haloIntensity: Number(get(settingAtom({ name: 'haloIntensity', planetId: 'lunar-eclipse' }))),
  haloWidth: Number(get(settingAtom({ name: 'haloWidth', planetId: 'lunar-eclipse' }))),
  offsetX: Number(get(settingAtom({ name: 'offsetX', planetId: 'lunar-eclipse' }))),
  offsetY: Number(get(settingAtom({ name: 'offsetY', planetId: 'lunar-eclipse' }))),
}))

export const moonLightingAtom = atom((get) => ({
  earthshineIntensity: Number(get(settingAtom({ name: 'earthshineIntensity', planetId: 'moon' }))),
  sunAzimuth: Number(get(settingAtom({ name: 'sunAzimuth', planetId: 'moon' }))),
  sunElevation: Number(get(settingAtom({ name: 'sunElevation', planetId: 'moon' }))),
}))

export const skyLightingAtom = atom((get) => ({
  exposure: Number(get(settingAtom({ name: 'exposure', planetId: 'sky' }))),
  field: Number(get(settingAtom({ name: 'field', planetId: 'sky' }))),
  glare: Number(get(settingAtom({ name: 'glare', planetId: 'sky' }))),
  haze: Number(get(settingAtom({ name: 'haze', planetId: 'sky' }))),
  ozone: Number(get(settingAtom({ name: 'ozone', planetId: 'sky' }))),
  sunElevation: Number(get(settingAtom({ name: 'sunElevation', planetId: 'sky' }))),
  sunScale: Number(get(settingAtom({ name: 'sunScale', planetId: 'sky' }))),
}))

export const applyPlanetSettingsAtom = atom(
  null,
  (get, set, { planetId, values }: { planetId: PlanetId; values: PlanetSettings }) => {
    for (const [name, value] of Object.entries(values)) {
      const target = settingAtom({ name, planetId })
      if (get(target) !== value) set(target, value)
    }
  },
)

export const resetPlanetSettingsAtom = atom(null, (get, set, planetId: PlanetId) => {
  for (const { initial, name } of parameterDefinitions[planetId]) {
    const target = settingAtom({ name, planetId })
    if (get(target) !== initial) set(target, initial)
  }
})
