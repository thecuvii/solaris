import { preloadTextureImages } from '@thecuvii/solaris'

export type PlanetId =
  | 'earth'
  | 'jupiter'
  | 'lunar-eclipse'
  | 'mars'
  | 'mercury'
  | 'moon'
  | 'neptune'
  | 'pluto'
  | 'saturn'
  | 'sun'
  | 'titan'
  | 'uranus'
  | 'venus'

export type TexturedPlanetId =
  | 'earth'
  | 'jupiter'
  | 'lunar-eclipse'
  | 'mars'
  | 'mercury'
  | 'moon'
  | 'pluto'
  | 'saturn'
  | 'sun'
  | 'venus'

export type Planet = {
  componentName?: string
  id: PlanetId
  name: string
  packageName: string
  summary: string
}

export const planets: readonly Planet[] = [
  {
    id: 'sun',
    name: 'Sun',
    packageName: 'sun',
    summary: 'A data-driven solar surface with active regions, filaments, and limb emission.',
  },
  {
    id: 'mercury',
    name: 'Mercury',
    packageName: 'mercury',
    summary: 'A cratered, airless surface with topographic relief and severe grazing light.',
  },
  {
    id: 'venus',
    name: 'Venus',
    packageName: 'venus',
    summary: 'Dense sulfur clouds with super-rotating flow, haze, and forward scattering.',
  },
  {
    id: 'earth',
    name: 'Earth',
    packageName: 'earth',
    summary: 'Layered atmosphere, moving clouds, ocean glint, and emissive city lights.',
  },
  {
    id: 'moon',
    name: 'Moon',
    packageName: 'moon',
    summary: 'High-relief lunar shading with opposition surge, earthshine, and grazing shadows.',
  },
  {
    componentName: 'LunarEclipse',
    id: 'lunar-eclipse',
    name: 'Lunar Eclipse',
    packageName: 'moon',
    summary: 'A lunar eclipse with refracted atmospheric light, soft penumbra, and relief shadows.',
  },
  {
    id: 'mars',
    name: 'Mars',
    packageName: 'mars',
    summary: 'A dusty photometric surface with topographic relief and a thin blue aureole.',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    packageName: 'jupiter',
    summary: 'Layered cloud bands, zonal flow, and a controllable Great Red Spot vortex.',
  },
  {
    id: 'saturn',
    name: 'Saturn',
    packageName: 'saturn',
    summary: 'Oblate atmosphere, translucent rings, and physically linked ring shadows.',
  },
  {
    id: 'titan',
    name: 'Titan',
    packageName: 'titan',
    summary: 'A dense nitrogen atmosphere with layered haze, polar hood, and forward scattering.',
  },
  {
    id: 'uranus',
    name: 'Uranus',
    packageName: 'uranus',
    summary: 'A pale ice giant with subtle bands, polar haze, and an extreme axial tilt.',
  },
  {
    id: 'neptune',
    name: 'Neptune',
    packageName: 'neptune',
    summary: 'A deep blue atmosphere with high-altitude clouds, storms, and zonal winds.',
  },
  {
    id: 'pluto',
    name: 'Pluto',
    packageName: 'pluto',
    summary: 'An icy dwarf planet with albedo variation, rugged relief, and a tenuous haze.',
  },
]

export const textures = {
  earth: {
    cloud: '/textures/v1/earth/earth-cloud.webp',
    day: '/textures/v1/earth/earth-day.webp',
    material: '/textures/v1/earth/earth-material.webp',
    night: '/textures/v1/earth/earth-night.webp',
    normal: '/textures/v1/earth/earth-normal.webp',
    roughness: '/textures/v1/earth/earth-roughness.webp',
  },
  jupiter: { albedo: '/textures/v1/jupiter/jupiter-albedo.webp' },
  mars: {
    albedo: '/textures/v1/mars/mars-albedo.webp',
    normalHeight: '/textures/v1/mars/mars-normal-height.png',
  },
  moon: {
    albedo: '/textures/v1/moon/moon-albedo.webp',
    normalHeight: '/textures/v1/moon/moon-normal-height.webp',
  },
  'lunar-eclipse': {
    albedo: '/textures/v1/moon/moon-albedo.webp',
    normalHeight: '/textures/v1/moon/moon-normal-height.webp',
  },
  mercury: {
    albedo: '/textures/v1/mercury/mercury-albedo.webp',
    normalHeight: '/textures/v1/mercury/mercury-normal-height.png',
  },
  pluto: {
    albedo: '/textures/v1/pluto/pluto-albedo.png',
    normalHeight: '/textures/v1/pluto/pluto-normal-height.png',
  },
  saturn: {
    atmosphere: '/textures/v1/saturn/saturn-atmosphere.webp',
    rings: '/textures/v1/saturn/saturn-rings.png',
  },
  sun: { observation: '/textures/v1/sun/sun-aia-304.png' },
  venus: { cloudStructure: '/textures/v1/venus/venus-cloud-structure.webp' },
} as const satisfies Record<TexturedPlanetId, Record<string, string>>

export function isPlanetId(value: unknown): value is PlanetId {
  return typeof value === 'string' && planets.some((planet) => planet.id === value)
}

export function getPlanet(id: unknown): Planet | undefined {
  return planets.find((planet) => planet.id === id)
}

export function getPlanetTextureUrls(id: PlanetId | undefined): string[] {
  return id && hasTextures(id) ? Object.values(textures[id]) : []
}

export function preloadPlanetTextures(id: PlanetId): void {
  const urls = getPlanetTextureUrls(id)
  if (urls.length === 0) return
  void preloadTextureImages(urls).catch(() => {})
}

function hasTextures(id: PlanetId): id is TexturedPlanetId {
  return id in textures
}
