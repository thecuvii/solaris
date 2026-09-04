import { preloadTextureImages } from '@thecuvii/solaris'

export type PlanetId =
  | 'earth'
  | 'jupiter'
  | 'lunar-eclipse'
  | 'mars'
  | 'mercury'
  | 'moon'
  | 'neptune'
  | 'observed-sun'
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
    componentName: 'ObservedSun',
    id: 'observed-sun',
    name: 'Observed Sun',
    packageName: 'observed-sun',
    summary:
      'The Sun as photographed from the ground: haze-softened disc, refraction flattening, cloud striations, and lens glare.',
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
  jupiter: { albedo: '/textures/v1/jupiter/jupiter-albedo-2048.webp' },
  mars: {
    albedo: '/textures/v1/mars/mars-albedo-2048.webp',
    normalHeight: '/textures/v1/mars/mars-normal-height-2048.png',
  },
  moon: {
    albedo: '/textures/v1/moon/moon-albedo-2048.webp',
    normalHeight: '/textures/v1/moon/moon-normal-height-2048.webp',
  },
  'lunar-eclipse': {
    albedo: '/textures/v1/moon/moon-albedo-2048.webp',
    normalHeight: '/textures/v1/moon/moon-normal-height-2048.webp',
  },
  mercury: {
    albedo: '/textures/v1/mercury/mercury-albedo-1024.webp',
    normalHeight: '/textures/v1/mercury/mercury-normal-height-1024.png',
  },
  pluto: {
    albedo: '/textures/v1/pluto/pluto-albedo-1024.png',
    normalHeight: '/textures/v1/pluto/pluto-normal-height-1024.png',
  },
  saturn: {
    atmosphere: '/textures/v1/saturn/saturn-atmosphere.webp',
    rings: '/textures/v1/saturn/saturn-rings.png',
  },
  sun: { observation: '/textures/v1/sun/sun-aia-304.webp' },
  venus: { cloudStructure: '/textures/v1/venus/venus-cloud-structure.webp' },
} as const satisfies Record<TexturedPlanetId, Record<string, string>>

export type TextureDoc = {
  description: string
  filename: string
  format: 'PNG' | 'WebP'
  key: string
  label: string
  packed: boolean
  url: string
}

type TextureDocNote = Pick<TextureDoc, 'description' | 'label' | 'packed'>

const moonTextureNotes = {
  albedo: {
    description: 'LROC WAC sRGB color. Equirectangular, seam-repaired, −180°..180° east.',
    label: 'Albedo',
    packed: false,
  },
  normalHeight: {
    description:
      'RGB tangent-space normal. Alpha stores elevation over the fixed range −10 km to 12 km.',
    label: 'Normal + height',
    packed: true,
  },
} as const

const textureNotes = {
  earth: {
    cloud: {
      description: 'Cloud structure extracted from the packed three.js map. Alpha is unused.',
      label: 'Cloud',
      packed: false,
    },
    day: {
      description: 'sRGB dayside color. Equirectangular, −180°..180° east.',
      label: 'Day',
      packed: false,
    },
    material: {
      description: 'Ocean/land mask derived from roughness. White is water, black is land.',
      label: 'Material',
      packed: false,
    },
    night: {
      description: 'Emissive city lights for the night side. Equirectangular, matched to day.',
      label: 'Night',
      packed: false,
    },
    normal: {
      description: 'Seam-wrapped tangent-space normal generated from the packed bump channel.',
      label: 'Normal',
      packed: false,
    },
    roughness: {
      description: 'Land/ocean roughness channel extracted from the packed three.js map.',
      label: 'Roughness',
      packed: false,
    },
  },
  jupiter: {
    albedo: {
      description:
        'Hubble OPAL 2019 display color. No height or normals are derived from this map.',
      label: 'Albedo',
      packed: false,
    },
  },
  mars: {
    albedo: {
      description: 'Viking MDIM sRGB color. Equirectangular, −180°..180° east.',
      label: 'Albedo',
      packed: false,
    },
    normalHeight: {
      description:
        'RG octahedral tangent normal. BA is unsigned 16-bit MOLA height, high byte then low byte.',
      label: 'Normal + height',
      packed: true,
    },
  },
  mercury: {
    albedo: {
      description:
        'Stretched MDIS WAC color, not human-eye RGB or absolute albedo. Matched in size to the height map.',
      label: 'Albedo',
      packed: false,
    },
    normalHeight: {
      description:
        'RG octahedral tangent normal. BA is unsigned 16-bit height from −10764 m to 8994 m.',
      label: 'Normal + height',
      packed: true,
    },
  },
  moon: moonTextureNotes,
  'lunar-eclipse': moonTextureNotes,
  pluto: {
    albedo: {
      description:
        'New Horizons display color. Alpha stores DEM confidence as round(c × 254) + 1; byte 0 is reserved.',
      label: 'Albedo',
      packed: false,
    },
    normalHeight: {
      description:
        'RG octahedral tangent normal. BA is unsigned 16-bit height. Unobserved terrain stays at datum.',
      label: 'Normal + height',
      packed: true,
    },
  },
  saturn: {
    atmosphere: {
      description:
        'Periodic cloud atlas with muted color. Alpha is synthetic optical structure, not measured opacity.',
      label: 'Atmosphere',
      packed: false,
    },
    rings: {
      description: 'Radial ring color and opacity strip used for the ring plane and shadows.',
      label: 'Rings',
      packed: false,
    },
  },
  sun: {
    observation: {
      description:
        'SDO/AIA 304 Å coded-color disk at 1024². Alpha is coverage. Fitted center and radius stay /1024.',
      label: 'AIA 304',
      packed: false,
    },
  },
  venus: {
    cloudStructure: {
      description:
        'Neutral grayscale cloud structure from Mariner 10. Not UV albedo, optical depth, or radar terrain.',
      label: 'Cloud structure',
      packed: false,
    },
  },
} as const satisfies {
  [K in TexturedPlanetId]: {
    [P in keyof (typeof textures)[K]]: { description: string; label: string; packed: boolean }
  }
}

export function isPlanetId(value: unknown): value is PlanetId {
  return typeof value === 'string' && planets.some((planet) => planet.id === value)
}

export function getPlanet(id: unknown): Planet | undefined {
  return planets.find((planet) => planet.id === id)
}

export function getPlanetTextureUrls(id: PlanetId | undefined): string[] {
  return id && hasTextures(id) ? Object.values(textures[id]) : []
}

export function getPlanetTextureDocs(id: PlanetId): readonly TextureDoc[] {
  if (!hasTextures(id)) return []
  const notes = textureNotes[id] as Record<string, TextureDocNote>
  return Object.entries(textures[id]).map(([key, url]) => {
    const note = notes[key]
    return {
      description: note.description,
      filename: url.slice(url.lastIndexOf('/') + 1),
      format: url.endsWith('.png') ? 'PNG' : 'WebP',
      key,
      label: note.label,
      packed: note.packed,
      url,
    }
  })
}

export function preloadPlanetTextures(id: PlanetId): void {
  const urls = getPlanetTextureUrls(id)
  if (urls.length === 0) return
  void preloadTextureImages(urls).catch(() => {})
}

function hasTextures(id: PlanetId): id is TexturedPlanetId {
  return id in textures
}
