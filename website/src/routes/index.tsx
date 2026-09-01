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
    speed('rotationSpeed', 0.006),
    unit('roughness', 0.78),
    angle('sunAzimuth', -38),
    number('sunElevation', 16, -90, 90, 1, '°'),
    angle('surfaceRotation', 0),
    amount('tholinStrength', 1),
    angle('viewTilt', 10),
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
  sun: { left: 94, top: 2 },
  mercury: { left: 177, top: 55 },
  venus: { left: 225, top: 108 },
  earth: { left: 256, top: 161 },
  moon: { left: 275, top: 214 },
  mars: { left: 285, top: 267 },
  jupiter: { left: 285, top: 320 },
  saturn: { left: 277, top: 373 },
  titan: { left: 258, top: 426 },
  uranus: { left: 228, top: 479 },
  neptune: { left: 182, top: 532 },
  pluto: { left: 102, top: 585 },
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
            <span aria-hidden="true">↗</span>
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

      <Inspector planetId={selectedPlanet} settings={settings} updateSetting={updateSetting} />
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
              <span
                {...stylex.props(
                  styles.planetThumbnail,
                  selectedPlanet === planet.id && styles.planetThumbnailSelected,
                )}
                aria-hidden="true"
              >
                <PlanetPreview id={planet.id} settings={initialSettings[planet.id]} />
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
  settings,
  updateSetting,
}: {
  planetId: PlanetId
  settings: PlanetSettings
  updateSetting: (name: string, value: boolean | number) => void
}) {
  const definitions = parameterDefinitions[planetId]

  return (
    <aside {...stylex.props(styles.inspector)}>
      <div {...stylex.props(styles.inspectorHeader)}>
        <h2 {...stylex.props(styles.inspectorTitle)}>Parameters</h2>
      </div>

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
    <Slider.Root
      max={max}
      min={min}
      onValueChange={onValueChange}
      step={step}
      value={value}
      {...stylex.props(styles.sliderRoot)}
    >
      <div {...stylex.props(styles.sliderMeta)}>
        <Slider.Label {...stylex.props(styles.sliderLabel)}>{label}</Slider.Label>
        <span {...stylex.props(styles.sliderValue)}>
          {value.toFixed(precision)}
          {suffix}
        </span>
      </div>
      <Slider.Control {...stylex.props(styles.sliderControl)}>
        <Slider.Track {...stylex.props(styles.sliderTrack)}>
          <Slider.Indicator {...stylex.props(styles.sliderIndicator)} />
          <Slider.Thumb aria-label={label} {...stylex.props(styles.sliderThumb)} />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
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
        <div {...stylex.props(styles.codeDots)} aria-hidden="true">
          <span {...stylex.props(styles.codeDot)} />
          <span {...stylex.props(styles.codeDot)} />
          <span {...stylex.props(styles.codeDot)} />
        </div>
        <span>example.tsx</span>
        <button
          aria-label={copied ? 'Code copied' : 'Copy code'}
          onClick={() => void copy(code)}
          type="button"
          {...stylex.props(styles.codeCopy)}
        >
          <CopyIcon copied={copied} />
          {copied ? 'Copied' : 'Copy'}
        </button>
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

function getPrecision(step: number): number {
  return step < 0.01 ? 3 : step < 1 ? 2 : 0
}

function formatParameterName(name: string): string {
  const words = name.replace(/Degrees$/, '').replaceAll(/([a-z])([A-Z])/g, '$1 $2')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const styles = stylex.create({
  code: {
    color: '#b9b9b9',
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    lineHeight: 1.7,
    margin: 0,
    overflowX: 'auto',
    paddingBlock: 20,
    paddingInline: 22,
  },
  codeDots: {
    display: 'flex',
    gap: 5,
    marginRight: 4,
  },
  codeDot: {
    backgroundColor: '#414141',
    borderRadius: '50%',
    height: 6,
    width: 6,
  },
  codeHeader: {
    alignItems: 'center',
    color: '#777777',
    display: 'flex',
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: 10,
    gap: 8,
    height: 38,
    paddingInline: 14,
  },
  codeCopy: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: '#777777',
    cursor: 'pointer',
    display: 'flex',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    gap: 5,
    marginLeft: 'auto',
    padding: 4,
    ':hover': { color: '#cfcfcf' },
    ':focus-visible': { color: '#ffffff', outline: 'none' },
  },
  codeSection: {
    backgroundColor: '#0d0d0d',
    borderRadius: 12,
    marginTop: 18,
    minWidth: 0,
    overflow: 'hidden',
  },
  componentName: {
    backgroundColor: '#171717',
    borderRadius: 999,
    color: '#8d8d8d',
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
    height: 12,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.25,
    width: 12,
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 22,
    paddingBlock: 26,
  },
  disc: {
    backgroundColor: '#0b0b0b',
    backgroundImage:
      'radial-gradient(circle at 58% 44%, rgba(255,255,255,0.06), transparent 42%), repeating-radial-gradient(circle, transparent 0 51px, rgba(255,255,255,0.035) 52px 53px)',
    borderRadius: '50%',
    height: 640,
    left: -320,
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    transformOrigin: 'center',
    width: 640,
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
    backgroundColor: '#343434',
    borderRadius: '50%',
    boxShadow: '0 0 0 7px rgba(255,255,255,0.025)',
    height: 8,
    position: 'absolute',
    right: 42,
    top: 'calc(50% - 4px)',
    width: 8,
  },
  githubLink: {
    alignItems: 'center',
    color: '#7f7f7f',
    display: 'flex',
    fontSize: 12,
    gap: 6,
    textDecoration: 'none',
    ':hover': { color: '#ffffff' },
    ':focus-visible': { color: '#ffffff', outline: 'none' },
  },
  header: {
    alignItems: 'center',
    display: 'flex',
    height: 70,
    justifyContent: 'space-between',
  },
  inspector: {
    height: '100dvh',
    minWidth: 0,
    overflowY: 'auto',
    paddingBlock: 24,
    paddingInline: 24,
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
      position: 'relative',
      right: 'auto',
      top: 'auto',
      width: 'auto',
    },
  },
  inspectorHeader: {
    alignItems: 'flex-start',
    display: 'flex',
    justifyContent: 'space-between',
    paddingBottom: 22,
  },
  inspectorNote: {
    alignItems: 'flex-start',
    color: '#606060',
    display: 'flex',
    fontSize: 10,
    gap: 9,
    lineHeight: 1.5,
    paddingTop: 22,
  },
  inspectorTitle: {
    color: '#cfcfcf',
    fontSize: 13,
    fontWeight: 550,
    marginBlock: 6,
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
  page: {
    backgroundColor: '#080808',
    display: 'grid',
    gridTemplateColumns: '350px minmax(400px, 1fr) 300px',
    minHeight: '100dvh',
    overflow: 'clip',
    '@media (max-width: 1080px)': {
      gridTemplateColumns: '300px minmax(360px, 1fr) 260px',
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
    width: 350,
    '@media (max-width: 1080px)': {
      width: 300,
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
    backgroundColor: '#050505',
    borderRadius: 10,
    flex: '0 0 auto',
    height: 38,
    overflow: 'hidden',
    pointerEvents: 'none',
    transition: 'box-shadow 150ms ease',
    width: 38,
    '@media (max-width: 920px)': {
      height: 30,
      width: 30,
    },
  },
  planetThumbnailSelected: {
    boxShadow: '0 0 22px rgba(255,255,255,0.2)',
  },
  planetList: {
    height: 640,
    left: 0,
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    transformOrigin: 'center',
    width: 353,
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
    borderRadius: 14,
    borderWidth: 0,
    color: '#686868',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    fontSize: 10,
    gap: 3,
    left: 'var(--planet-left)',
    lineHeight: 1.1,
    paddingBlock: 2,
    paddingInline: 2,
    position: 'absolute',
    scrollSnapAlign: 'center',
    textAlign: 'center',
    transition: 'background-color 150ms ease, color 150ms ease',
    whiteSpace: 'nowrap',
    top: 'var(--planet-top)',
    width: 68,
    ':hover': { color: '#d7d7d7' },
    ':focus-visible': { backgroundColor: '#1b1b1b', color: '#ffffff', outline: 'none' },
    '@media (max-width: 1080px)': {
      left: 'calc(var(--planet-left) - 20px)',
    },
    '@media (max-width: 920px)': {
      backgroundColor: '#111111',
      flex: '0 0 auto',
      fontSize: 9,
      left: 'auto',
      position: 'relative',
      top: 'auto',
    },
  },
  planetTabSelected: {
    backgroundColor: '#151515',
    color: '#f0f0f0',
  },
  sliderControl: {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    height: 24,
    touchAction: 'none',
    userSelect: 'none',
    width: '100%',
  },
  sliderIndicator: {
    backgroundColor: '#a6a6a6',
    borderRadius: 999,
  },
  sliderLabel: {
    color: '#9a9a9a',
    fontSize: 11,
  },
  sliderMeta: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
  },
  sliderRoot: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  sliderThumb: {
    backgroundColor: '#e8e8e8',
    borderRadius: '50%',
    boxShadow: '0 0 8px rgba(255,255,255,0.24)',
    height: 12,
    width: 12,
    ':focus-visible': { backgroundColor: '#ffffff', outline: 'none' },
  },
  sliderTrack: {
    backgroundColor: '#2b2b2b',
    borderRadius: 999,
    height: 2,
    position: 'relative',
    width: '100%',
  },
  sliderValue: {
    color: '#707070',
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: 10,
  },
  stage: {
    backgroundColor: '#050505',
    backgroundImage: 'radial-gradient(circle at 50% 48%, #151515 0, #090909 42%, #050505 70%)',
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
    color: '#777777',
    fontSize: 12,
    lineHeight: 1.65,
    marginBottom: 0,
    marginTop: 8,
    maxWidth: 560,
  },
  switchLabel: {
    alignItems: 'center',
    color: '#9a9a9a',
    display: 'flex',
    fontSize: 11,
    justifyContent: 'space-between',
  },
  switchRoot: {
    backgroundColor: '#2b2b2b',
    borderRadius: 999,
    borderWidth: 0,
    cursor: 'pointer',
    height: 16,
    padding: 0,
    position: 'relative',
    transition: 'background-color 150ms ease',
    width: 30,
    ':focus-visible': { backgroundColor: '#3b3b3b', outline: 'none' },
  },
  switchRootChecked: {
    backgroundColor: '#a6a6a6',
  },
  switchThumb: {
    backgroundColor: '#8a8a8a',
    borderRadius: '50%',
    display: 'block',
    height: 12,
    transform: 'translateX(2px)',
    transition: 'background-color 150ms ease, transform 150ms ease',
    width: 12,
  },
  switchThumbChecked: {
    backgroundColor: '#101010',
    transform: 'translateX(16px)',
  },
  title: {
    color: '#ededed',
    fontSize: 'clamp(32px, 4vw, 48px)',
    fontWeight: 500,
    letterSpacing: '-0.045em',
    lineHeight: 1,
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
    color: '#dedede',
    display: 'flex',
    fontSize: 13,
    fontWeight: 620,
    gap: 9,
    letterSpacing: '-0.02em',
    textDecoration: 'none',
    ':focus-visible': { color: '#ffffff', outline: 'none' },
  },
  wordmarkMark: {
    backgroundColor: '#e6e6e6',
    borderRadius: '50%',
    boxShadow: 'inset -3px -2px 0 #777777',
    height: 11,
    width: 11,
  },
})
