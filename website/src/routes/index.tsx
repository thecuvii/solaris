import { Button } from '@base-ui/react/button'
import { Collapsible } from '@base-ui/react/collapsible'
import { NumberField } from '@base-ui/react/number-field'
import { Slider } from '@base-ui/react/slider'
import { Switch } from '@base-ui/react/switch'
import { createHighlighterCoreSync } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import tsx from '@shikijs/langs/tsx'
import githubDarkDefault from '@shikijs/themes/github-dark-default'
import { Tabs } from '@base-ui/react/tabs'
import * as stylex from '@stylexjs/stylex'
import { Earth } from '@thecuvii/solaris/earth'
import { Jupiter } from '@thecuvii/solaris/jupiter'
import { Mars } from '@thecuvii/solaris/mars'
import { Mercury } from '@thecuvii/solaris/mercury'
import { Moon } from '@thecuvii/solaris/moon'
import { Neptune } from '@thecuvii/solaris/neptune'
import { Pluto } from '@thecuvii/solaris/pluto'
import { Saturn } from '@thecuvii/solaris/saturn'
import { Sun } from '@thecuvii/solaris/sun'
import { Titan } from '@thecuvii/solaris/titan'
import { Uranus } from '@thecuvii/solaris/uranus'
import { Venus } from '@thecuvii/solaris/venus'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useClipboard } from 'foxact/use-clipboard'
import type { CSSProperties } from 'react'
import { useState } from 'react'

export const Route = createFileRoute('/')({ component: HomePage })

type PlanetId =
  | 'earth'
  | 'jupiter'
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

type TexturedPlanetId =
  | 'earth'
  | 'jupiter'
  | 'mars'
  | 'mercury'
  | 'moon'
  | 'pluto'
  | 'saturn'
  | 'sun'
  | 'venus'

type PlanetSettings = Record<string, boolean | number>

type ParameterDefinition =
  | {
      initial: boolean
      kind: 'boolean'
      name: string
    }
  | {
      initial: number
      kind: 'number'
      max: number
      min: number
      name: string
      step: number
      suffix?: string
    }

type ParameterGroupId = 'atmosphere' | 'features' | 'lighting' | 'orientation' | 'rings' | 'surface'

type Planet = {
  id: PlanetId
  name: string
  packageName: string
  summary: string
}

const planets: readonly Planet[] = [
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

const parameterDefinitions: Record<PlanetId, readonly ParameterDefinition[]> = {
  earth: [
    amount('aerosol', 1),
    amount('atmosphereDensity', 1),
    number('atmosphereThickness', 0.16, 0, 0.5, 0.01),
    amount('cloudDensity', 1),
    number('cloudHeight', 0.012, 0, 0.05, 0.001),
    unit('cloudShadowIntensity', 0.48),
    amount('detailIntensity', 1),
    amount('detailSpeed', 1),
    toggle('manualOrbit', false),
    amount('multipleScattering', 1),
    number('nightLightIntensity', 1, 0, 3, 0.01),
    amount('oceanGlint', 0.72),
    amount('oceanWaveStrength', 0.8),
    speed('orbitSpeed', 0.08, -0.2, 0.2),
    toggle('showAtmosphere', true),
    toggle('showFlightRoutes', false),
    toggle('showSatelliteOrbits', false),
    angle('sunAzimuth', -41.25),
    number('sunElevation', 8, -90, 90, 1, '°'),
  ],
  jupiter: [
    unit('cloudPhotometricMix', 0.35),
    unit('detailIntensity', 0.11),
    number('detailScale', 1, 0, 4, 0.01),
    speed('detailSpeed', 0.055, -0.2, 0.2),
    exposure(1.05),
    unit('jetStrength', 0.65),
    unit('limbHaze', 0.16),
    number('oblateness', 0.0649, 0, 0.2, 0.001),
    speed('rotationSpeed', 0.025),
    angle('sunAzimuth', -32),
    number('sunElevation', 12, -90, 90, 1, '°'),
    angle('surfaceRotation', 0),
    unit('vortexStrength', 0.42),
  ],
  mars: [
    unit('atmosphereDensity', 0.22),
    angle('axialTilt', 8),
    unit('blueAureole', 0.12),
    unit('dustAerosol', 0.36),
    unit('dustDetail', 0.1),
    exposure(1.06),
    number('normalStrength', 1.6, 0, 3, 0.01),
    unit('photometricMix', 0.45),
    speed('rotationSpeed', 0.021),
    amount('selfShadowStrength', 1),
    angle('sunAzimuth', -48),
    number('sunElevation', 9, -90, 90, 1, '°'),
    angle('surfaceRotation', 0),
  ],
  mercury: [
    exposure(0.92),
    unit('microDetail', 0.08),
    number('normalStrength', 1.35, 0, 3, 0.01),
    amount('photometricStrength', 1),
    unit('reliefShadowStrength', 0.72),
    speed('rotationSpeed', 0.01),
    angle('sunAzimuth', -12),
    number('sunElevation', 14, -90, 90, 1, '°'),
    angle('surfaceRotation', 0),
    angle('viewTilt', 0),
  ],
  moon: [
    amount('bloomIntensity', 0),
    unit('bloomRadius', 0.08),
    unit('bloomWarmth', 0.35),
    number('earthshineIntensity', 0.006, 0, 0.05, 0.001),
    exposure(0.72),
    number('normalStrength', 0.85, 0, 3, 0.01),
    unit('oppositionStrength', 0.25),
    number('oppositionWidth', 0.035, 0, 0.2, 0.001),
    unit('photometricMix', 0.14),
    unit('reliefShadowStrength', 0.58),
    speed('rotationSpeed', 0.012),
    angle('sunAzimuth', -48),
    number('sunElevation', 16, -90, 90, 1, '°'),
    angle('surfaceRotation', 0),
    amount('veilingGlare', 0),
  ],
  neptune: [
    amount('cloudRelief', 1),
    unit('companionCloud', 0.68),
    unit('deepOpticalDepth', 0.72),
    exposure(0.72),
    unit('flowDetail', 0.34),
    unit('forwardScattering', 0.28),
    unit('hazeOpticalDepth', 0.48),
    unit('methaneAbsorption', 0.78),
    number('oblateness', 0.017, 0, 0.2, 0.001),
    speed('rotationSpeed', 0.022),
    angle('sunAzimuth', -10),
    number('sunElevation', 5, -90, 90, 1, '°'),
    angle('surfaceRotation', 0),
    unit('upperClouds', 0.68),
    unit('upperHaze', 0.3),
    unit('vortexCirculation', 0.48),
    unit('vortexDarkness', 0.5),
    angle('weatherTilt', 18),
    unit('windScale', 0.62),
  ],
  pluto: [
    exposure(1),
    unit('hazeForwardScattering', 0.78),
    unit('hazeIntensity', 0.28),
    unit('hazeThickness', 0.08),
    unit('iceResponse', 0.6),
    unit('phaseFill', 0.035),
    amount('reliefStrength', 0.85),
    speed('rotationSpeed', 0),
    unit('roughness', 0.78),
    angle('sunAzimuth', -38),
    number('sunElevation', 16, -90, 90, 1, '°'),
    angle('surfaceRotation', 0),
    amount('tholinStrength', 1),
    angle('viewTilt', 25),
  ],
  saturn: [
    angle('axialRoll', -8),
    unit('bandContrast', 0.12),
    unit('cloudPhotometricMix', 0.42),
    unit('detailIntensity', 0.06),
    speed('detailSpeed', 0.018, -0.2, 0.2),
    exposure(0.96),
    unit('forwardScatter', 0.35),
    unit('limbHaze', 0.1),
    number('oblateness', 0.09796, 0, 0.2, 0.001),
    unit('polarHexagon', 0.14),
    unit('ringOpacity', 1),
    unit('ringShadowStrength', 0.82),
    angle('ringTilt', 26),
    speed('rotationSpeed', 0.018),
    angle('sunAzimuth', -38),
    number('sunElevation', -8, -90, 90, 1, '°'),
    angle('surfaceRotation', 0),
    unit('unlitRingBrightness', 0.08),
  ],
  sun: [
    unit('activeRegionGain', 0.28),
    number('contrast', 1.06, 0, 3, 0.01),
    exposure(1),
    unit('filamentDepth', 0.42),
    number('flowAmount', 1.6, 0, 3, 0.01),
    number('flowSpeed', 1, -2, 2, 0.01),
    amount('limbEmission', 1),
    number('saturation', 1.04, 0, 2, 0.01),
  ],
  titan: [
    unit('bandContrast', 0.28),
    unit('detachedHaze', 0.72),
    exposure(1),
    amount('forwardScatteringStrength', 1),
    amount('hazeDensity', 1),
    amount('hazeThickness', 1),
    angle('longitudeOffsetDegrees', 0),
    unit('polarHood', 0.34),
    speed('rotationSpeed', 0.012),
    angle('sunAzimuthDegrees', -58),
    number('sunElevationDegrees', 18, -90, 90, 1, '°'),
    number('viewLatitudeDegrees', 8, -90, 90, 1, '°'),
  ],
  uranus: [
    unit('aerosolDepth', 0.72),
    number('atmosphereThickness', 0.025, 0, 0.2, 0.001),
    unit('bandContrast', 0.13),
    unit('cloudContrast', 0.08),
    number('epsilonEccentricity', 0.00794, 0, 0.1, 0.001),
    angle('epsilonPeriapsis', 0),
    exposure(0.86),
    unit('forwardScattering', 0.15),
    unit('hazeOpacity', 0.34),
    number('hoodLatitude', 45, -90, 90, 1, '°'),
    number('hoodPole', 1, -1, 1, 2),
    number('hoodSoftness', 10, 0, 45, 1, '°'),
    unit('limbDarkening', 0.72),
    unit('methaneAbsorption', 0.58),
    number('oblateness', 0.022927, 0, 0.2, 0.001),
    unit('phaseFill', 0.08),
    unit('polarHood', 0.26),
    angle('poleAzimuth', -26),
    number('poleElevation', 38, -90, 90, 1, '°'),
    unit('ringShadow', 0.75),
    number('ringVisibility', 4.5, 0, 8, 0.1),
    speed('rotationSpeed', -0.008),
    angle('sunAzimuth', -28),
    number('sunElevation', 55, -90, 90, 1, '°'),
    angle('surfaceRotation', 18),
    unit('windScale', 0.2),
  ],
  venus: [
    angle('axialTilt', -3),
    unit('cloudContrast', 0.3),
    unit('cloudDetail', 0.22),
    exposure(1.08),
    speed('flowSpeed', 0.045, -0.2, 0.2),
    unit('flowStrength', 0.7),
    unit('forwardScattering', 0.72),
    unit('gloryStrength', 0.18),
    unit('opticalDepth', 0.72),
    speed('rotationSpeed', -0.026),
    unit('sulfurTint', 0.72),
    angle('sunAzimuth', -52),
    number('sunElevation', 9, -90, 90, 1, '°'),
    angle('surfaceRotation', 0),
    unit('upperHaze', 0.46),
  ],
}

const initialSettings = Object.fromEntries(
  Object.entries(parameterDefinitions).map(([planetId, definitions]) => [
    planetId,
    Object.fromEntries(definitions.map((definition) => [definition.name, definition.initial])),
  ]),
) as Record<PlanetId, PlanetSettings>

const parameterGroups: readonly { id: ParameterGroupId; label: string }[] = [
  { id: 'surface', label: 'Surface & material' },
  { id: 'atmosphere', label: 'Atmosphere' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'orientation', label: 'Orientation & motion' },
  { id: 'rings', label: 'Rings' },
  { id: 'features', label: 'Features' },
]

const textures = {
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

const planetPositions: Record<PlanetId, { left: number; top: number }> = {
  sun: { left: 51, top: 15 },
  mercury: { left: 101, top: 40 },
  venus: { left: 144, top: 75 },
  earth: { left: 178, top: 118 },
  moon: { left: 202, top: 168 },
  mars: { left: 214, top: 222 },
  jupiter: { left: 214, top: 278 },
  saturn: { left: 202, top: 332 },
  titan: { left: 178, top: 386 },
  uranus: { left: 144, top: 435 },
  neptune: { left: 101, top: 490 },
  pluto: { left: 51, top: 515 },
}

const planetThumbnailScales: Record<PlanetId, number> = {
  sun: 1.1,
  mercury: 1,
  venus: 1.15,
  earth: 1.15,
  moon: 1.1,
  mars: 1.1,
  jupiter: 1,
  saturn: 1,
  titan: 1.05,
  uranus: 2,
  neptune: 1.05,
  pluto: 1.05,
}

const earthModel = {
  mieExtinction: [8, 8, 8],
  mieScattering: [5.4, 5.1, 4.8],
  ozoneAbsorption: [0.65, 1.88, 0.08],
  rayleighScattering: [3.2, 7.6, 18.5],
  space: [0, 0, 0.002],
  surfaceDay: [0.035, 0.22, 0.3],
  surfaceNight: [0.002, 0.006, 0.018],
  sun: [1, 0.91, 0.72],
  sunIntensity: 18,
} as const

const highlighter = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  langs: [tsx],
  themes: [githubDarkDefault],
})

function HomePage() {
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetId>('earth')
  const [settingsByPlanet, setSettingsByPlanet] = useState(initialSettings)
  const planet = planets.find(({ id }) => id === selectedPlanet) ?? planets[0]
  const settings = settingsByPlanet[selectedPlanet]

  function selectPlanet(value: Tabs.Tab.Value): void {
    const nextPlanet = planets.find(({ id }) => id === value)
    if (nextPlanet) setSelectedPlanet(nextPlanet.id)
  }

  function updateSetting(name: string, value: boolean | number): void {
    setSettingsByPlanet((current) => ({
      ...current,
      [selectedPlanet]: { ...current[selectedPlanet], [name]: value },
    }))
  }

  function resetSettings(): void {
    setSettingsByPlanet((current) => ({
      ...current,
      [selectedPlanet]: { ...initialSettings[selectedPlanet] },
    }))
  }

  return (
    <Tabs.Root value={selectedPlanet} onValueChange={selectPlanet} {...stylex.props(styles.page)}>
      <PlanetPicker selectedPlanet={selectedPlanet} />

      <main {...stylex.props(styles.content)}>
        <header {...stylex.props(styles.header)}>
          <Link to="/" {...stylex.props(styles.wordmark)}>
            <span {...stylex.props(styles.wordmarkMark)} aria-hidden="true" />
            Solaris
          </Link>
          <a href="https://github.com/thecuvii/solaris" {...stylex.props(styles.githubLink)}>
            GitHub
            <span aria-hidden="true" {...stylex.props(styles.githubArrow)}>
              ↗
            </span>
          </a>
        </header>

        <Tabs.Panel value={selectedPlanet} {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.introduction)}>
            <div {...stylex.props(styles.titleRow)}>
              <h1 {...stylex.props(styles.title)}>{planet.name}</h1>
              <span {...stylex.props(styles.componentName)}>&lt;{planet.name} /&gt;</span>
            </div>
            <p {...stylex.props(styles.summary)}>{planet.summary}</p>
          </div>

          <div {...stylex.props(styles.stage)} aria-label={`${planet.name} shader preview`}>
            <div {...stylex.props(styles.stageGrid)} aria-hidden="true" />
            <PlanetPreview id={selectedPlanet} settings={settings} />
          </div>

          <CodeBlock planet={planet} settings={settings} />
        </Tabs.Panel>
      </main>

      <Inspector
        planetId={selectedPlanet}
        resetSettings={resetSettings}
        settings={settings}
        updateSetting={updateSetting}
      />
    </Tabs.Root>
  )
}

function PlanetPicker({ selectedPlanet }: { selectedPlanet: PlanetId }) {
  return (
    <aside {...stylex.props(styles.picker)} aria-label="Celestial objects">
      <div {...stylex.props(styles.disc)} aria-hidden="true">
        <div {...stylex.props(styles.discAxis)} />
      </div>
      <Tabs.List {...stylex.props(styles.planetList)}>
        {planets.map((planet) => {
          const position = planetPositions[planet.id]

          return (
            <Tabs.Tab
              key={planet.id}
              value={planet.id}
              style={
                {
                  '--planet-left': `${position.left}px`,
                  '--planet-top': `${position.top}px`,
                } as CSSProperties
              }
              {...stylex.props(
                styles.planetTab,
                selectedPlanet === planet.id && styles.planetTabSelected,
              )}
            >
              <span {...stylex.props(styles.planetThumbnail)} aria-hidden="true">
                <span
                  style={
                    {
                      '--planet-thumbnail-scale': planetThumbnailScales[planet.id],
                    } as CSSProperties
                  }
                  {...stylex.props(
                    styles.planetThumbnailCanvas,
                    selectedPlanet === planet.id && styles.planetThumbnailSelected,
                  )}
                >
                  <PlanetPreview id={planet.id} settings={initialSettings[planet.id]} />
                </span>
              </span>
              <span>{planet.name}</span>
            </Tabs.Tab>
          )
        })}
      </Tabs.List>
    </aside>
  )
}

function PlanetPreview({ id, settings }: { id: PlanetId; settings: PlanetSettings }) {
  const shared = {
    ...settings,
    style: { height: '100%', position: 'relative' as const, width: '100%' },
  }

  switch (id) {
    case 'earth':
      return <Earth {...shared} model={earthModel} textures={textures.earth} />
    case 'jupiter':
      return <Jupiter {...shared} textures={textures.jupiter} />
    case 'mars':
      return <Mars {...shared} textures={textures.mars} />
    case 'mercury':
      return <Mercury {...shared} textures={textures.mercury} />
    case 'moon':
      return <Moon {...shared} textures={textures.moon} />
    case 'neptune':
      return <Neptune {...shared} />
    case 'pluto':
      return <Pluto {...shared} textures={textures.pluto} />
    case 'saturn':
      return <Saturn {...shared} textures={textures.saturn} />
    case 'sun':
      return <Sun {...shared} textures={textures.sun} />
    case 'titan':
      return <Titan {...shared} />
    case 'uranus':
      return <Uranus {...shared} />
    case 'venus':
      return <Venus {...shared} textures={textures.venus} />
  }
}

function Inspector({
  planetId,
  resetSettings,
  settings,
  updateSetting,
}: {
  planetId: PlanetId
  resetSettings: () => void
  settings: PlanetSettings
  updateSetting: (name: string, value: boolean | number) => void
}) {
  const definitions = parameterDefinitions[planetId]
  const groups = parameterGroups
    .map((group) => ({
      ...group,
      definitions: definitions.filter((definition) => getParameterGroup(definition) === group.id),
    }))
    .filter((group) => group.definitions.length > 0)
  const isDefault = definitions.every(
    (definition) => settings[definition.name] === definition.initial,
  )

  return (
    <aside {...stylex.props(styles.inspector)}>
      <div {...stylex.props(styles.inspectorHeader)}>
        <div>
          <h2 {...stylex.props(styles.inspectorTitle)}>Parameters</h2>
          <span {...stylex.props(styles.inspectorSubtitle)}>{formatParameterName(planetId)}</span>
        </div>
        <Button
          disabled={isDefault}
          onClick={resetSettings}
          {...stylex.props(styles.resetButton, isDefault && styles.resetButtonDisabled)}
        >
          <ResetIcon />
          Reset
        </Button>
      </div>

      <div {...stylex.props(styles.inspectorGroups)}>
        {groups.map((group) => (
          <ParameterGroup
            key={group.id}
            definitions={group.definitions}
            label={group.label}
            settings={settings}
            updateSetting={updateSetting}
          />
        ))}
      </div>

      <div {...stylex.props(styles.inspectorNote)}>
        <span {...stylex.props(styles.noteIcon)} aria-hidden="true">
          i
        </span>
        <p {...stylex.props(styles.noteCopy)}>
          Values are passed directly to the component. No renderer restart is required.
        </p>
      </div>
    </aside>
  )
}

function ParameterGroup({
  definitions,
  label,
  settings,
  updateSetting,
}: {
  definitions: readonly ParameterDefinition[]
  label: string
  settings: PlanetSettings
  updateSetting: (name: string, value: boolean | number) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} {...stylex.props(styles.parameterGroup)}>
      <Collapsible.Trigger {...stylex.props(styles.groupTrigger)}>
        <span>{label}</span>
        <span {...stylex.props(styles.groupCount)}>{definitions.length}</span>
        <ChevronIcon open={open} />
      </Collapsible.Trigger>
      <Collapsible.Panel {...stylex.props(styles.groupPanel)}>
        <div {...stylex.props(styles.controlGroup)}>
          {definitions.map((definition) =>
            definition.kind === 'number' ? (
              <ParameterSlider
                key={definition.name}
                label={formatParameterName(definition.name)}
                max={definition.max}
                min={definition.min}
                onValueChange={(value) => updateSetting(definition.name, value)}
                step={definition.step}
                suffix={definition.suffix}
                value={Number(settings[definition.name])}
              />
            ) : (
              <ParameterSwitch
                key={definition.name}
                checked={Boolean(settings[definition.name])}
                label={formatParameterName(definition.name)}
                onCheckedChange={(checked) => updateSetting(definition.name, checked)}
              />
            ),
          )}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function ParameterSwitch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label {...stylex.props(styles.switchLabel)}>
      <span>{label}</span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        {...stylex.props(styles.switchRoot, checked && styles.switchRootChecked)}
      >
        <Switch.Thumb {...stylex.props(styles.switchThumb, checked && styles.switchThumbChecked)} />
        <span {...stylex.props(styles.switchOption, !checked && styles.switchOptionActive)}>
          Off
        </span>
        <span {...stylex.props(styles.switchOption, checked && styles.switchOptionActive)}>On</span>
      </Switch.Root>
    </label>
  )
}

function ParameterSlider({
  label,
  max,
  min,
  onValueChange,
  step,
  suffix = '',
  value,
}: {
  label: string
  max: number
  min: number
  onValueChange: (value: number) => void
  step: number
  suffix?: string
  value: number
}) {
  const precision = getPrecision(step)

  return (
    <NumberField.Root
      format={{ maximumFractionDigits: precision, minimumFractionDigits: precision }}
      max={max}
      min={min}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onValueChange(nextValue)
      }}
      snapOnStep
      step={step}
      value={value}
      {...stylex.props(styles.numberFieldRoot)}
    >
      <div {...stylex.props(styles.sliderMeta)}>
        <span {...stylex.props(styles.sliderLabel)}>{label}</span>
        <span {...stylex.props(styles.numberFieldValue)}>
          <NumberField.Input aria-label={label} {...stylex.props(styles.numberFieldInput)} />
          {suffix && <span {...stylex.props(styles.numberFieldSuffix)}>{suffix}</span>}
        </span>
      </div>
      <Slider.Root
        aria-label={label}
        max={max}
        min={min}
        onValueChange={onValueChange}
        step={step}
        value={value}
        {...stylex.props(styles.sliderRoot)}
      >
        <Slider.Control {...stylex.props(styles.sliderControl)}>
          <Slider.Track {...stylex.props(styles.sliderTrack)}>
            <Slider.Indicator {...stylex.props(styles.sliderIndicator)} />
            <Slider.Thumb aria-label={label} {...stylex.props(styles.sliderThumb)} />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </NumberField.Root>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      {...stylex.props(styles.chevronIcon, open && styles.chevronIconOpen)}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.resetIcon)}>
      <path d="M3.5 5.5A5 5 0 1 1 3 9M3.5 5.5V2.75M3.5 5.5h2.75" />
    </svg>
  )
}

function CodeBlock({ planet, settings }: { planet: Planet; settings: PlanetSettings }) {
  const { copied, copy } = useClipboard({ timeout: 1500 })
  const planetTextures = hasTextures(planet.id) ? textures[planet.id] : undefined
  const textureDeclaration = planetTextures
    ? `const textures = {
${Object.entries(planetTextures)
  .map(([name, source]) => `  ${name}: '${source}',`)
  .join('\n')}
}

`
    : ''
  const modelDeclaration =
    planet.id === 'earth'
      ? `const earthModel = {
  mieExtinction: [8, 8, 8],
  mieScattering: [5.4, 5.1, 4.8],
  ozoneAbsorption: [0.65, 1.88, 0.08],
  rayleighScattering: [3.2, 7.6, 18.5],
  space: [0, 0, 0.002],
  surfaceDay: [0.035, 0.22, 0.3],
  surfaceNight: [0.002, 0.006, 0.018],
  sun: [1, 0.91, 0.72],
  sunIntensity: 18,
} as const

`
      : ''
  const propLines = [
    planetTextures && '  textures={textures}',
    planet.id === 'earth' && '  model={earthModel}',
    ...parameterDefinitions[planet.id].map((definition) => {
      const value = settings[definition.name]
      return definition.kind === 'boolean'
        ? `  ${definition.name}={${String(value)}}`
        : `  ${definition.name}={${Number(value).toFixed(getPrecision(definition.step))}}`
    }),
  ].filter(Boolean)
  const code = `import { ${planet.name} } from '@thecuvii/solaris/${planet.packageName}'

${textureDeclaration}${modelDeclaration}<${planet.name}
${propLines.join('\n')}
/>`
  const lines = highlighter.codeToTokensBase(code, {
    lang: 'tsx',
    theme: 'github-dark-default',
  })

  return (
    <section {...stylex.props(styles.codeSection)}>
      <div {...stylex.props(styles.codeHeader)}>
        <div {...stylex.props(styles.codeFile)}>
          <CodeFileIcon />
          <span>example.tsx</span>
        </div>
        <Button
          aria-label={copied ? 'Code copied' : 'Copy code'}
          onClick={() => void copy(code)}
          type="button"
          {...stylex.props(styles.codeFile, styles.codeCopy, copied && styles.codeCopyCopied)}
        >
          <CopyIcon copied={copied} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre {...stylex.props(styles.code)}>
        <code>
          {lines.map((line, lineIndex) => (
            <span key={line[0]?.offset ?? `blank-${lineIndex}`}>
              {line.map((token) => (
                <span key={token.offset} style={{ color: token.color }}>
                  {token.content}
                </span>
              ))}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </section>
  )
}

function CodeFileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.codeFileIcon)}>
      <path d="m5.5 5-3 3 3 3M10.5 5l3 3-3 3M9 3.5l-2 9" />
    </svg>
  )
}

function CopyIcon({ copied }: { copied: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.copyIcon)}>
      {copied ? (
        <path d="m3 8.5 3 3 7-7" />
      ) : (
        <>
          <rect height="9" rx="1.5" width="9" x="5" y="2" />
          <path d="M11 11v1.5A1.5 1.5 0 0 1 9.5 14h-6A1.5 1.5 0 0 1 2 12.5v-6A1.5 1.5 0 0 1 3.5 5H5" />
        </>
      )}
    </svg>
  )
}

function hasTextures(id: PlanetId): id is TexturedPlanetId {
  return id in textures
}

function number(
  name: string,
  initial: number,
  min: number,
  max: number,
  step: number,
  suffix?: string,
): ParameterDefinition {
  return { initial, kind: 'number', max, min, name, step, suffix }
}

function amount(name: string, initial: number): ParameterDefinition {
  return number(name, initial, 0, 2, 0.01)
}

function unit(name: string, initial: number): ParameterDefinition {
  return number(name, initial, 0, 1, 0.01)
}

function angle(name: string, initial: number): ParameterDefinition {
  return number(name, initial, -180, 180, 1, '°')
}

function speed(name: string, initial: number, min = -0.1, max = 0.1): ParameterDefinition {
  return number(name, initial, min, max, 0.001)
}

function exposure(initial: number): ParameterDefinition {
  return number('exposure', initial, 0.4, 1.5, 0.01)
}

function toggle(name: string, initial: boolean): ParameterDefinition {
  return { initial, kind: 'boolean', name }
}

function getParameterGroup(definition: ParameterDefinition): ParameterGroupId {
  if (definition.kind === 'boolean') return 'features'

  const name = definition.name.toLowerCase()
  if (definition.name.startsWith('ring') || definition.name.includes('Ring')) return 'rings'
  if (
    /aerosol|atmosphere|aureole|cloud|haze|methane|optical|scattering|vortex|wind|jet|hood/.test(
      name,
    )
  ) {
    return 'atmosphere'
  }
  if (/sun|exposure|night|bloom|earthshine|opposition|phase|glare|glint|emission/.test(name)) {
    return 'lighting'
  }
  if (
    /speed|rotation|tilt|roll|view|pole|longitude|azimuth|elevation|oblateness|epsilon|orbit/.test(
      name,
    )
  ) {
    return 'orientation'
  }
  return 'surface'
}

function getPrecision(step: number): number {
  return step < 0.01 ? 3 : step < 1 ? 2 : 0
}

function formatParameterName(name: string): string {
  const words = name.replace(/Degrees$/, '').replaceAll(/([a-z])([A-Z])/g, '$1 $2')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const styles = stylex.create({
  chevronIcon: {
    fill: 'none',
    height: 14,
    marginLeft: 2,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.4,
    transform: 'rotate(0deg)',
    transition: 'transform 180ms cubic-bezier(0.25, 1, 0.5, 1)',
    width: 14,
  },
  chevronIconOpen: {
    transform: 'rotate(180deg)',
  },
  code: {
    backgroundColor: '#0c0e10',
    borderRadius: 10,
    color: '#b9b9b9',
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    lineHeight: 1.7,
    margin: 0,
    overflowX: 'auto',
    paddingBlock: 22,
    paddingInline: 18,
  },
  codeFile: {
    alignItems: 'center',
    color: 'rgba(242, 232, 208, 0.5)',
    display: 'flex',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
    fontSize: 11,
    fontWeight: 550,
    gap: 6,
    height: 32,
  },
  codeFileIcon: {
    fill: 'none',
    height: 13,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.25,
    width: 13,
  },
  codeHeader: {
    alignItems: 'center',
    display: 'flex',
    height: 46,
    paddingInline: 10,
  },
  codeCopy: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: {
      default: 'rgba(242, 232, 208, 0.5)',
      ':hover': '#f2e8d0',
      ':focus-visible': '#f2e8d0',
    },
    cursor: 'pointer',
    marginLeft: 'auto',
    padding: 0,
    textDecoration: { ':focus-visible': 'underline' },
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': { outline: 'none' },
  },
  codeCopyCopied: {
    color: '#f2e8d0',
  },
  codeSection: {
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.032))',
    borderRadius: 16,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.075), 0 16px 48px rgba(0,0,0,0.2)',
    marginTop: 18,
    minWidth: 0,
    overflow: 'hidden',
    padding: 6,
  },
  componentName: {
    backgroundColor: 'rgba(242, 232, 208, 0.065)',
    borderRadius: 999,
    color: 'rgba(242, 232, 208, 0.5)',
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: 10,
    paddingBlock: 6,
    paddingInline: 10,
  },
  content: {
    gridColumn: 2,
    minWidth: 0,
    paddingBlock: 0,
    paddingInline: 'clamp(24px, 4vw, 64px)',
    '@media (max-width: 920px)': {
      gridColumn: 'auto',
    },
  },
  copyIcon: {
    fill: 'none',
    height: 13,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.25,
    width: 13,
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingBottom: 8,
  },
  groupCount: {
    alignItems: 'center',
    backgroundColor: 'rgba(242, 232, 208, 0.06)',
    borderRadius: 999,
    color: 'rgba(242, 232, 208, 0.34)',
    display: 'flex',
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: 9,
    height: 18,
    justifyContent: 'center',
    marginLeft: 'auto',
    minWidth: 18,
    paddingInline: 5,
  },
  groupPanel: {
    overflow: 'hidden',
  },
  groupTrigger: {
    alignItems: 'center',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.03)',
    },
    borderRadius: 8,
    borderWidth: 0,
    color: 'rgba(242, 232, 208, 0.66)',
    cursor: 'pointer',
    display: 'flex',
    fontSize: 12,
    fontWeight: 600,
    gap: 6,
    height: 36,
    paddingInline: 8,
    textAlign: 'left',
    width: '100%',
    ':focus-visible': {
      boxShadow: 'inset 0 0 0 2px rgba(242,232,208,0.46)',
      outline: 'none',
    },
  },
  disc: {
    backgroundColor: 'transparent',
    backgroundImage:
      'repeating-radial-gradient(circle, transparent 0 42px, rgba(242,232,208,0.032) 43px 44px)',
    borderRadius: '50%',
    height: 520,
    left: -260,
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    transformOrigin: 'center',
    width: 520,
    '@media (min-width: 921px) and (max-height: 850px)': {
      transform: 'translateY(-50%) scale(0.82)',
    },
    '@media (max-width: 920px)': {
      height: 320,
      left: '50%',
      top: -254,
      transform: 'translateX(-50%)',
      width: 320,
    },
  },
  discAxis: {
    backgroundColor: 'rgba(242, 232, 208, 0.24)',
    borderRadius: '50%',
    boxShadow: '0 0 0 7px rgba(255,255,255,0.025)',
    height: 8,
    position: 'absolute',
    right: 34,
    top: 'calc(50% - 4px)',
    width: 8,
  },
  githubLink: {
    alignItems: 'center',
    backdropFilter: 'blur(6px)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.1))',
    borderRadius: 12,
    boxShadow: {
      default:
        'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.22)',
      ':hover':
        'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.35), 0 12px 30px rgba(0,0,0,0.3)',
      ':active':
        'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.3)',
      ':focus-visible':
        '0 0 0 2px #101112, 0 0 0 4px rgba(242,232,208,0.62), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.22)',
    },
    color: '#f2e8d0',
    display: 'flex',
    fontSize: 13,
    fontWeight: 600,
    gap: 8,
    height: 44,
    paddingInline: 16,
    textDecoration: 'none',
    transform: {
      default: 'translateY(0)',
      ':hover': 'translateY(-1px)',
      ':active': 'translateY(0)',
    },
    transition:
      'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
    ':focus-visible': { outline: 'none' },
  },
  githubArrow: {
    display: 'inline-block',
    transform: { default: 'translateX(0)', ':hover': 'translateX(2px)' },
    transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  },
  header: {
    alignItems: 'center',
    display: 'flex',
    height: 70,
    justifyContent: 'space-between',
  },
  inspector: {
    backgroundColor: 'rgba(8, 9, 10, 0.28)',
    height: '100dvh',
    minWidth: 0,
    overflowY: 'auto',
    padding: 12,
    position: 'fixed',
    right: 0,
    top: 0,
    width: 300,
    '@media (max-width: 1080px)': {
      width: 260,
    },
    '@media (max-width: 920px)': {
      height: 'auto',
      overflowY: 'visible',
      paddingBlock: 28,
      paddingInline: 24,
      position: 'relative',
      right: 'auto',
      top: 'auto',
      width: 'auto',
    },
  },
  inspectorHeader: {
    alignItems: 'center',
    backgroundImage: 'linear-gradient(180deg, #101112 78%, rgba(16,17,18,0))',
    display: 'flex',
    justifyContent: 'space-between',
    paddingBlock: 8,
    paddingInline: 4,
    position: 'sticky',
    top: 0,
    zIndex: 4,
  },
  inspectorGroups: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingTop: 8,
  },
  inspectorNote: {
    alignItems: 'flex-start',
    color: 'rgba(242, 232, 208, 0.32)',
    display: 'flex',
    fontSize: 10,
    gap: 9,
    lineHeight: 1.5,
    paddingTop: 22,
  },
  inspectorTitle: {
    color: '#f2e8d0',
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '-0.015em',
    margin: 0,
  },
  inspectorSubtitle: {
    color: 'rgba(242, 232, 208, 0.34)',
    display: 'block',
    fontSize: 10,
    marginTop: 2,
  },
  introduction: {
    paddingBottom: 20,
  },
  noteIcon: {
    alignItems: 'center',
    borderRadius: '50%',
    display: 'flex',
    flex: '0 0 auto',
    fontFamily: 'Georgia, serif',
    height: 15,
    justifyContent: 'center',
    width: 15,
  },
  noteCopy: {
    margin: 0,
  },
  numberFieldInput: {
    appearance: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: 'rgba(242, 232, 208, 0.72)',
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: 10,
    height: 26,
    padding: 0,
    textAlign: 'right',
    width: 54,
    ':focus-visible': {
      backgroundColor: 'rgba(242, 232, 208, 0.08)',
      borderRadius: 6,
      boxShadow: 'inset 0 0 0 2px rgba(242,232,208,0.38)',
      color: '#f2e8d0',
      outline: 'none',
    },
  },
  numberFieldRoot: {
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderRadius: 8,
    height: 42,
    overflow: 'hidden',
    position: 'relative',
    transition: 'background-color 140ms ease-out',
    ':hover': { backgroundColor: 'rgba(255,255,255,0.065)' },
  },
  numberFieldSuffix: {
    color: 'rgba(242, 232, 208, 0.35)',
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: 10,
  },
  numberFieldValue: {
    alignItems: 'center',
    display: 'flex',
    gap: 2,
    pointerEvents: 'auto',
  },
  parameterGroup: {
    minWidth: 0,
  },
  page: {
    backgroundColor: '#101112',
    display: 'grid',
    gridTemplateColumns: '300px minmax(400px, 1fr) 300px',
    minHeight: '100dvh',
    overflow: 'clip',
    '@media (max-width: 1080px)': {
      gridTemplateColumns: '260px minmax(360px, 1fr) 260px',
    },
    '@media (max-width: 920px)': {
      display: 'block',
      overflow: 'hidden',
    },
  },
  panel: {
    display: 'block',
    marginInline: 'auto',
    maxWidth: 820,
    paddingBottom: 44,
    paddingTop: 'clamp(24px, 4vh, 52px)',
  },
  picker: {
    height: '100dvh',
    left: 0,
    minHeight: '100dvh',
    overflow: 'visible',
    position: 'fixed',
    top: 0,
    width: 300,
    '@media (max-width: 1080px)': {
      width: 260,
    },
    '@media (max-width: 920px)': {
      height: 'auto',
      left: 'auto',
      minHeight: 104,
      overflow: 'hidden',
      paddingTop: 34,
      position: 'relative',
      top: 'auto',
      width: 'auto',
    },
  },
  planetThumbnail: {
    flex: '0 0 auto',
    height: 40,
    overflow: 'visible',
    pointerEvents: 'none',
    position: 'relative',
    width: 40,
    '@media (max-width: 920px)': {
      height: 34,
      width: 34,
    },
  },
  planetThumbnailCanvas: {
    inset: 0,
    position: 'absolute',
    transform: 'scale(var(--planet-thumbnail-scale))',
    transition: 'filter 150ms ease-out',
  },
  planetThumbnailSelected: {
    filter: 'drop-shadow(0 0 6px rgba(242,232,208,0.22))',
  },
  planetList: {
    height: 560,
    left: 0,
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    transformOrigin: 'center',
    width: 300,
    '@media (min-width: 921px) and (max-height: 850px)': {
      transform: 'translateY(-50%) scale(0.82)',
    },
    '@media (max-width: 920px)': {
      alignItems: 'center',
      display: 'flex',
      gap: 8,
      height: 'auto',
      left: 'auto',
      overflowX: 'auto',
      paddingBlock: 13,
      paddingInline: 16,
      position: 'relative',
      scrollSnapType: 'x proximity',
      top: 'auto',
      transform: 'none',
      width: '100%',
    },
  },
  planetTab: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: {
      default: 'rgba(242, 232, 208, 0.42)',
      ':hover': 'rgba(242, 232, 208, 0.76)',
      ':focus-visible': '#f2e8d0',
    },
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    fontSize: 10,
    gap: 3,
    left: 'var(--planet-left)',
    lineHeight: 1.1,
    minHeight: 60,
    padding: 4,
    position: 'absolute',
    scrollSnapAlign: 'center',
    textAlign: 'center',
    textDecoration: { ':focus-visible': 'underline' },
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    whiteSpace: 'nowrap',
    top: 'var(--planet-top)',
    width: 68,
    ':focus-visible': { outline: 'none' },
    '@media (max-width: 1080px)': {
      left: 'calc(var(--planet-left) - 12px)',
    },
    '@media (max-width: 920px)': {
      flex: '0 0 auto',
      fontSize: 9,
      left: 'auto',
      position: 'relative',
      top: 'auto',
    },
  },
  planetTabSelected: {
    color: '#f2e8d0',
    fontWeight: 600,
  },
  resetButton: {
    alignItems: 'center',
    backgroundColor: {
      default: 'rgba(255,255,255,0.055)',
      ':hover': 'rgba(255,255,255,0.09)',
      ':active': 'rgba(255,255,255,0.04)',
    },
    borderRadius: 8,
    borderWidth: 0,
    color: 'rgba(242,232,208,0.7)',
    cursor: 'pointer',
    display: 'flex',
    fontSize: 10,
    fontWeight: 550,
    gap: 5,
    height: 30,
    paddingInline: 9,
    transition: 'background-color 140ms ease-out, color 140ms ease-out, opacity 140ms ease-out',
    ':focus-visible': {
      boxShadow: 'inset 0 0 0 2px rgba(242,232,208,0.46)',
      color: '#f2e8d0',
      outline: 'none',
    },
  },
  resetButtonDisabled: {
    cursor: 'default',
    opacity: 0.28,
  },
  resetIcon: {
    fill: 'none',
    height: 12,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.25,
    width: 12,
  },
  sliderControl: {
    cursor: 'pointer',
    height: '100%',
    touchAction: 'none',
    userSelect: 'none',
    width: '100%',
  },
  sliderIndicator: {
    backgroundColor: 'rgba(242, 232, 208, 0.075)',
    height: '100%',
  },
  sliderLabel: {
    color: 'rgba(242, 232, 208, 0.68)',
    fontSize: 12,
    fontWeight: 500,
  },
  sliderMeta: {
    alignItems: 'center',
    display: 'flex',
    inset: 0,
    justifyContent: 'space-between',
    paddingInline: 10,
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: 2,
  },
  sliderRoot: {
    inset: 0,
    position: 'absolute',
  },
  sliderThumb: {
    backgroundColor: 'rgba(242, 232, 208, 0.56)',
    borderRadius: '50%',
    height: 20,
    opacity: 0.55,
    transition: 'box-shadow 140ms ease-out, opacity 140ms ease-out',
    width: 3,
    ':has(input:focus-visible)': {
      boxShadow: '0 0 0 4px rgba(242,232,208,0.16), 0 0 12px rgba(242,232,208,0.3)',
      opacity: 1,
    },
  },
  sliderTrack: {
    height: '100%',
    position: 'relative',
    width: '100%',
  },
  stage: {
    backgroundColor: '#050607',
    backgroundImage: 'radial-gradient(circle at 50% 48%, #111315 0, #090a0b 44%, #050607 72%)',
    borderRadius: 14,
    height: 'clamp(360px, 52vh, 590px)',
    overflow: 'hidden',
    position: 'relative',
  },
  stageGrid: {
    backgroundImage:
      'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
    backgroundSize: '48px 48px',
    inset: 0,
    maskImage: 'radial-gradient(circle, black, transparent 72%)',
    position: 'absolute',
  },
  summary: {
    color: 'rgba(242, 232, 208, 0.42)',
    fontSize: 12,
    lineHeight: 1.65,
    marginBottom: 0,
    marginTop: 8,
    maxWidth: 560,
  },
  switchLabel: {
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    color: 'rgba(242, 232, 208, 0.68)',
    display: 'flex',
    fontSize: 12,
    fontWeight: 500,
    height: 42,
    justifyContent: 'space-between',
    paddingInline: 10,
    transition: 'background-color 140ms ease-out',
    ':hover': { backgroundColor: 'rgba(255,255,255,0.065)' },
  },
  switchOption: {
    alignItems: 'center',
    color: 'rgba(242, 232, 208, 0.34)',
    display: 'flex',
    fontSize: 9,
    fontWeight: 550,
    height: 24,
    justifyContent: 'center',
    position: 'relative',
    transition: 'color 160ms ease-out',
    width: 32,
    zIndex: 1,
  },
  switchOptionActive: {
    color: '#f2e8d0',
  },
  switchRoot: {
    backgroundColor: 'rgba(242, 232, 208, 0.055)',
    borderRadius: 8,
    borderWidth: 0,
    cursor: 'pointer',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    height: 28,
    padding: 2,
    position: 'relative',
    transition: 'box-shadow 160ms ease-out',
    width: 68,
    ':focus-visible': {
      boxShadow: '0 0 0 3px rgba(242,232,208,0.18), inset 0 0 0 2px rgba(242,232,208,0.5)',
      outline: 'none',
    },
  },
  switchRootChecked: {
    backgroundColor: 'rgba(242, 232, 208, 0.055)',
  },
  switchThumb: {
    backgroundColor: 'rgba(242, 232, 208, 0.11)',
    borderRadius: 6,
    display: 'block',
    height: 24,
    left: 2,
    position: 'absolute',
    top: 2,
    transform: 'translateX(0)',
    transition: 'transform 180ms cubic-bezier(0.25, 1, 0.5, 1)',
    width: 32,
  },
  switchThumbChecked: {
    backgroundColor: 'rgba(242, 232, 208, 0.11)',
    transform: 'translateX(32px)',
  },
  title: {
    backgroundClip: 'text',
    backgroundImage: 'linear-gradient(180deg, #ffffff 8%, rgba(242,232,208,0.82) 100%)',
    color: 'transparent',
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 'clamp(36px, 4vw, 52px)',
    fontWeight: 590,
    letterSpacing: '-0.045em',
    lineHeight: 0.98,
    margin: 0,
  },
  titleRow: {
    alignItems: 'center',
    display: 'flex',
    gap: 13,
    marginTop: 8,
  },
  wordmark: {
    alignItems: 'center',
    color: '#f2e8d0',
    display: 'flex',
    fontSize: 13,
    fontWeight: 620,
    gap: 9,
    letterSpacing: '-0.02em',
    textDecoration: 'none',
    ':focus-visible': {
      boxShadow: '0 2px 0 rgba(242,232,208,0.62)',
      color: '#ffffff',
      outline: 'none',
    },
  },
  wordmarkMark: {
    backgroundColor: '#f2e8d0',
    borderRadius: '50%',
    boxShadow: 'inset -3px -2px 0 rgba(16,17,18,0.52)',
    height: 11,
    width: 11,
  },
})
