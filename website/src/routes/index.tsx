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
import { LunarEclipse, Moon } from '@thecuvii/solaris/moon'
import { Neptune } from '@thecuvii/solaris/neptune'
import { Pluto } from '@thecuvii/solaris/pluto'
import { Saturn } from '@thecuvii/solaris/saturn'
import { Sun } from '@thecuvii/solaris/sun'
import { Titan } from '@thecuvii/solaris/titan'
import { Uranus } from '@thecuvii/solaris/uranus'
import { Venus } from '@thecuvii/solaris/venus'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useClipboard } from 'foxact/use-clipboard'
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import type { Variants } from 'motion/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/')({ component: HomePage })

type PlanetId =
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

type TexturedPlanetId =
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
  componentName?: string
  id: PlanetId
  name: string
  packageName: string
  summary: string
}

type PlanetTransitionContext = {
  direction: -1 | 1
  reducedMotion: boolean
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
  'lunar-eclipse': [
    number('atmosphericOpticalDepth', 1.18, 0, 3, 0.01),
    exposure(1.18),
    number('haloIntensity', 1.15, 0, 3, 0.01),
    number('haloWidth', 0.23, 0, 1, 0.01),
    number('normalStrength', 0.82, 0, 3, 0.01),
    number('penumbraWidth', 0.72, 0, 2, 0.01),
    number('refractedLightIntensity', 1.7, 0, 4, 0.01),
    unit('reliefShadowStrength', 0.36),
    number('shadowOffsetX', 0.55, -3, 3, 0.01),
    number('shadowOffsetY', -1.55, -3, 3, 0.01),
    angle('surfaceRotation', 0),
    number('umbraRadius', 2.2, 0.5, 4, 0.01),
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

const planetPreviewVariants: Variants = {
  center: ({ reducedMotion }: PlanetTransitionContext) => ({
    opacity: 1,
    transform: 'translate3d(0, 0, 0) scale(1)',
    transition: {
      duration: reducedMotion ? 0.14 : 0.3,
      ease: reducedMotion ? 'linear' : [0.4, 0, 0.2, 1],
    },
  }),
  enter: ({ direction, reducedMotion }: PlanetTransitionContext) => ({
    opacity: 0,
    transform: reducedMotion
      ? 'translate3d(0, 0, 0) scale(1)'
      : `translate3d(${direction * 12}%, 0, 0) scale(0.96)`,
  }),
  exit: ({ direction, reducedMotion }: PlanetTransitionContext) => ({
    opacity: 0,
    transform: reducedMotion
      ? 'translate3d(0, 0, 0) scale(1)'
      : `translate3d(${direction * -12}%, 0, 0) scale(0.96)`,
    transition: {
      duration: reducedMotion ? 0.14 : 0.3,
      ease: reducedMotion ? 'linear' : [0.4, 0, 0.2, 1],
    },
  }),
}

function HomePage() {
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetId>('earth')
  const [transitionDirection, setTransitionDirection] = useState<-1 | 1>(1)
  const [settingsByPlanet, setSettingsByPlanet] = useState(initialSettings)
  const selectedPlanetRef = useRef<PlanetId>('earth')
  const transitionInFlightRef = useRef(false)
  const queuedPlanetRef = useRef<PlanetId | null>(null)
  const reduceMotion = useReducedMotion()
  const planet = planets.find(({ id }) => id === selectedPlanet) ?? planets[0]
  const componentName = planet.componentName ?? planet.name
  const settings = settingsByPlanet[selectedPlanet]

  function startPlanetTransition(nextPlanet: PlanetId): void {
    const currentPlanet = selectedPlanetRef.current
    if (nextPlanet === currentPlanet) return

    const currentIndex = planets.findIndex(({ id }) => id === currentPlanet)
    const nextIndex = planets.findIndex(({ id }) => id === nextPlanet)
    transitionInFlightRef.current = true
    selectedPlanetRef.current = nextPlanet
    setTransitionDirection(nextIndex > currentIndex ? 1 : -1)
    setSelectedPlanet(nextPlanet)
  }

  function selectPlanet(value: Tabs.Tab.Value): void {
    const nextPlanet = planets.find(({ id }) => id === value)
    if (!nextPlanet) return

    if (nextPlanet.id === selectedPlanetRef.current) {
      queuedPlanetRef.current = null
      return
    }

    if (transitionInFlightRef.current) {
      queuedPlanetRef.current = nextPlanet.id
      return
    }

    startPlanetTransition(nextPlanet.id)
  }

  function completePlanetTransition(): void {
    transitionInFlightRef.current = false
    const queuedPlanet = queuedPlanetRef.current
    queuedPlanetRef.current = null
    if (queuedPlanet) startPlanetTransition(queuedPlanet)
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
        <Tabs.Panel value={selectedPlanet} {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.introduction)}>
            <div {...stylex.props(styles.titleRow)}>
              <h1 {...stylex.props(styles.title)}>{planet.name}</h1>
              <span {...stylex.props(styles.componentName)}>&lt;{componentName} /&gt;</span>
            </div>
            <p {...stylex.props(styles.summary)}>{planet.summary}</p>
          </div>

          <div {...stylex.props(styles.stage)} aria-label={`${planet.name} shader preview`}>
            <AnimatePresence
              custom={{ direction: transitionDirection, reducedMotion: Boolean(reduceMotion) }}
              initial={false}
              onExitComplete={completePlanetTransition}
            >
              <motion.div
                key={selectedPlanet}
                animate="center"
                custom={{ direction: transitionDirection, reducedMotion: Boolean(reduceMotion) }}
                exit="exit"
                initial="enter"
                variants={planetPreviewVariants}
                {...stylex.props(styles.planetPreviewTransition)}
              >
                <PlanetPreview id={selectedPlanet} settings={settings} />
              </motion.div>
            </AnimatePresence>
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
      <div {...stylex.props(styles.pickerNavigation)}>
        <Link to="/" {...stylex.props(styles.wordmark, styles.pickerWordmark)}>
          <span {...stylex.props(styles.wordmarkMark)} aria-hidden="true" />
          Solaris
        </Link>

        <Tabs.List {...stylex.props(styles.planetList)}>
          {planets.map((planet) => (
            <Tabs.Tab
              key={planet.id}
              value={planet.id}
              {...stylex.props(
                styles.planetTab,
                selectedPlanet === planet.id && styles.planetTabSelected,
              )}
            >
              <span>{planet.name}</span>
              <span {...stylex.props(styles.planetThumbnail)} aria-hidden="true">
                <img
                  alt=""
                  draggable={false}
                  height={160}
                  src={`/thumbnails/v1/${planet.id}.avif`}
                  width={160}
                  {...stylex.props(
                    styles.planetThumbnailImage,
                    selectedPlanet === planet.id && styles.planetThumbnailSelected,
                  )}
                />
              </span>
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <div {...stylex.props(styles.pickerMeta)}>
          <div>
            Source ·{' '}
            <a href="https://github.com/thecuvii/solaris" {...stylex.props(styles.pickerMetaLink)}>
              GitHub
            </a>
          </div>
          <div>
            Made by{' '}
            <a href="https://github.com/thecuvii" {...stylex.props(styles.pickerMetaLink)}>
              Cuvii
            </a>
          </div>
        </div>
      </div>
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
    case 'lunar-eclipse':
      return <LunarEclipse {...shared} textures={textures['lunar-eclipse']} />
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

      <Button
        disabled={isDefault}
        onClick={resetSettings}
        {...stylex.props(styles.resetButton, isDefault && styles.resetButtonDisabled)}
      >
        <ResetIcon />
        Reset
      </Button>
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

  function clampValue(nextValue: number, lower: number, upper: number): number {
    return Math.min(Math.max(nextValue, lower), upper)
  }

  const getNormalizedValue = useCallback(
    (nextValue: number) => Math.min(Math.max((nextValue - min) / (max - min), 0), 1),
    [max, min],
  )

  function quantizeValue(nextValue: number): number {
    const clampedValue = clampValue(nextValue, min, max)
    if (clampedValue === min || clampedValue === max) return clampedValue

    const quantized = min + Math.round((clampedValue - min) / step) * step
    return clampValue(Number(quantized.toFixed(12)), min, max)
  }

  function getClickValue(nextValue: number, nextProgress: number): number {
    const stepCount = (max - min) / step
    if (stepCount <= 10) return quantizeValue(nextValue)

    const nearestDecile = Math.round(nextProgress * 10) / 10
    const snappedValue =
      Math.abs(nextProgress - nearestDecile) <= 0.03125
        ? min + nearestDecile * (max - min)
        : nextValue
    return quantizeValue(snappedValue)
  }

  const reduceMotion = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const valueRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pointerRef = useRef<{
    id: number
    moved: boolean
    startX: number
    startY: number
  } | null>(null)
  const interactingRef = useRef(false)
  const editingRef = useRef(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animationRef = useRef<ReturnType<typeof animate> | null>(null)
  const progress = useMotionValue(getNormalizedValue(value))
  const handleOpacity = useMotionValue(1)
  const fillWidth = useTransform(progress, (current) => `${current * 100}%`)
  const [hovered, setHovered] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [focused, setFocused] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editArmed, setEditArmed] = useState(false)
  const [draftValue, setDraftValue] = useState<number | null>(value)
  const active = hovered || interacting || focused || editing
  const atMaximum = value >= max

  function clearHoverTimer() {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  function setGestureActive(next: boolean) {
    interactingRef.current = next
    setInteracting(next)
  }

  const animateTo = useCallback(
    (nextProgress: number, bounce = 0.18) => {
      animationRef.current?.stop()
      if (reduceMotion) {
        progress.set(nextProgress)
        return
      }
      animationRef.current = animate(progress, nextProgress, {
        bounce,
        duration: 0.35,
        type: 'spring',
      })
    },
    [progress, reduceMotion],
  )

  function updateFromPointer(clientX: number, click: boolean) {
    const track = trackRef.current
    if (!track) return value

    const rect = track.getBoundingClientRect()
    const scale = rect.width / track.offsetWidth || 1
    const localX = (clientX - rect.left) / scale
    const rawProgress = localX / track.offsetWidth
    const nextProgress = clampValue(rawProgress, 0, 1)

    progress.set(nextProgress)

    const rawValue = min + nextProgress * (max - min)
    return click ? getClickValue(rawValue, nextProgress) : quantizeValue(rawValue)
  }

  const cancelGesture = useCallback(() => {
    if (!pointerRef.current) return
    pointerRef.current = null
    interactingRef.current = false
    setInteracting(false)
    animateTo(getNormalizedValue(value), 0.1)
  }, [animateTo, getNormalizedValue, value])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    animationRef.current?.stop()
    pointerRef.current = {
      id: event.pointerId,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setGestureActive(true)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return

    if (
      !pointer.moved &&
      Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= 3
    ) {
      pointer.moved = true
    }
    if (!pointer.moved) return

    onValueChange(updateFromPointer(event.clientX, false))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return

    const nextValue = updateFromPointer(event.clientX, !pointer.moved)
    onValueChange(nextValue)
    pointerRef.current = null
    setGestureActive(false)
    animateTo(getNormalizedValue(nextValue))
  }

  function beginEditing() {
    clearHoverTimer()
    editingRef.current = true
    setDraftValue(value)
    setEditing(true)
    queueMicrotask(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function commitEditing() {
    if (!editingRef.current) return
    editingRef.current = false
    setEditing(false)
    setEditArmed(false)
    if (draftValue === null || !Number.isFinite(draftValue)) {
      setDraftValue(value)
      return
    }

    const nextValue = quantizeValue(draftValue)
    setDraftValue(nextValue)
    onValueChange(nextValue)
  }

  function cancelEditing() {
    editingRef.current = false
    setDraftValue(value)
    setEditing(false)
    setEditArmed(false)
  }

  useEffect(() => {
    if (interactingRef.current || editingRef.current) return
    animateTo(getNormalizedValue(value), 0.12)
    setDraftValue(value)
  }, [animateTo, getNormalizedValue, value])

  useEffect(() => {
    function updateHandleOpacity(current = progress.get()) {
      const track = trackRef.current
      const labelElement = labelRef.current
      const valueElement = valueRef.current
      if (!track || !labelElement || !valueElement) return

      const handleX = current * track.offsetWidth
      const labelEnd = labelElement.offsetLeft + labelElement.offsetWidth + 12
      const valueStart = valueElement.offsetLeft - 12
      handleOpacity.set(
        Math.min(
          Math.min(Math.max((handleX - labelEnd) / 10, 0), 1),
          Math.min(Math.max((valueStart - handleX) / 10, 0), 1),
        ),
      )
    }

    updateHandleOpacity()
    const stopListening = progress.on('change', updateHandleOpacity)
    const resizeObserver = new ResizeObserver(() => updateHandleOpacity())
    if (trackRef.current) resizeObserver.observe(trackRef.current)
    if (labelRef.current) resizeObserver.observe(labelRef.current)
    if (valueRef.current) resizeObserver.observe(valueRef.current)

    return () => {
      stopListening()
      resizeObserver.disconnect()
    }
  }, [handleOpacity, progress])

  useEffect(() => {
    window.addEventListener('blur', cancelGesture)
    return () => window.removeEventListener('blur', cancelGesture)
  }, [cancelGesture])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current)
      animationRef.current?.stop()
    }
  }, [])

  return (
    <NumberField.Root
      format={{ maximumFractionDigits: precision, minimumFractionDigits: precision }}
      max={max}
      min={min}
      onValueChange={(nextValue) => {
        if (editingRef.current) setDraftValue(nextValue)
      }}
      snapOnStep
      step={step}
      value={editing ? draftValue : value}
      {...stylex.props(styles.numberFieldRoot)}
    >
      <Slider.Root
        aria-label={label}
        max={max}
        min={min}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
        }}
        onFocusCapture={() => setFocused(true)}
        onValueChange={onValueChange}
        step={step}
        value={value}
        {...stylex.props(styles.sliderRoot)}
      >
        <motion.div
          ref={trackRef}
          onLostPointerCapture={cancelGesture}
          onPointerCancel={cancelGesture}
          onPointerDown={handlePointerDown}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => {
            setHovered(false)
            clearHoverTimer()
            if (!editingRef.current) setEditArmed(false)
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          {...stylex.props(styles.sliderTrack)}
        >
          <motion.div
            style={{ width: fillWidth }}
            {...stylex.props(
              styles.sliderIndicator,
              active && styles.sliderIndicatorActive,
              atMaximum && styles.sliderIndicatorAtMaximum,
            )}
          />
          <span ref={labelRef} title={label} {...stylex.props(styles.sliderLabel)}>
            {label}
          </span>
          <span ref={valueRef} {...stylex.props(styles.numberFieldValue)}>
            <NumberField.Input
              ref={inputRef}
              aria-label={`${label} value`}
              readOnly={!editing}
              onBlur={commitEditing}
              onFocus={() => {
                if (!editingRef.current) {
                  editingRef.current = true
                  setDraftValue(value)
                  setEditing(true)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelEditing()
                  event.currentTarget.blur()
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  commitEditing()
                  event.currentTarget.blur()
                }
              }}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && !editArmed) {
                  event.preventDefault()
                  return
                }
                event.stopPropagation()
                beginEditing()
              }}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'mouse' || editingRef.current) return
                clearHoverTimer()
                hoverTimerRef.current = setTimeout(() => {
                  setEditArmed(true)
                  hoverTimerRef.current = null
                }, 800)
              }}
              onPointerLeave={() => {
                clearHoverTimer()
                if (!editingRef.current) setEditArmed(false)
              }}
              {...stylex.props(
                styles.numberFieldInput,
                (active || editArmed) && styles.numberFieldInputActive,
              )}
            />
            {suffix && (
              <span
                {...stylex.props(
                  styles.numberFieldSuffix,
                  (active || editArmed) && styles.numberFieldSuffixActive,
                )}
              >
                {suffix}
              </span>
            )}
          </span>
          <motion.div
            aria-hidden="true"
            style={{ left: fillWidth, opacity: handleOpacity }}
            {...stylex.props(styles.sliderThumb, active && styles.sliderThumbActive)}
          />
        </motion.div>
        <Slider.Control {...stylex.props(styles.sliderControl)}>
          <Slider.Track {...stylex.props(styles.sliderSemanticTrack)}>
            <Slider.Thumb aria-label={label} {...stylex.props(styles.sliderSemanticThumb)} />
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
  const componentName = planet.componentName ?? planet.name
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
  const code = `import { ${componentName} } from '@thecuvii/solaris/${planet.packageName}'

${textureDeclaration}${modelDeclaration}<${componentName}
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
    /aerosol|atmosphere|aureole|cloud|halo|haze|methane|optical|scattering|vortex|wind|jet|hood/.test(
      name,
    )
  ) {
    return 'atmosphere'
  }
  if (
    /sun|exposure|night|bloom|earthshine|opposition|phase|glare|glint|emission|shadow|umbra|penumbra|refracted/.test(
      name,
    )
  ) {
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
    marginLeft: 'auto',
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
    backgroundColor: '#090c14',
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
    fontFamily: '"Inter Variable", Inter, sans-serif',
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
    backgroundImage: 'linear-gradient(180deg, rgba(132,146,190,0.11), rgba(132,146,190,0.045))',
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
    '@media (max-width: 960px)': {
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
    gap: 4,
    paddingBlock: 4,
    paddingInline: 4,
  },
  groupPanel: {
    overflow: 'hidden',
  },
  groupTrigger: {
    alignItems: 'center',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'oklch(100% 0 0 / 0.04)',
    },
    borderRadius: 8,
    borderWidth: 0,
    color: 'rgba(242, 232, 208, 0.66)',
    cursor: 'pointer',
    display: 'flex',
    fontSize: 13,
    fontWeight: 600,
    gap: 6,
    height: 36,
    paddingInline: 8,
    textAlign: 'left',
    width: '100%',
    ':focus-visible': {
      boxShadow:
        'inset 0 1px 0 oklch(86.4% 0.003 84.6 / 0.12), 0 0 0 3px oklch(86.4% 0.003 84.6 / 0.08)',
      outline: 'none',
    },
  },
  inspector: {
    backdropFilter: 'blur(18px)',
    backgroundColor: 'oklch(8.52% 0.0384 274.56 / 0.9)',
    height: '100dvh',
    minWidth: 0,
    overflowY: 'auto',
    padding: 12,
    position: 'fixed',
    right: 0,
    top: 0,
    width: 280,
    '@media (max-width: 960px)': {
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
  inspectorGroups: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingTop: 12,
  },
  introduction: {
    paddingBottom: 20,
  },
  numberFieldInput: {
    appearance: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: 'oklch(86.4% 0.003 84.6 / 0.84)',
    fieldSizing: 'content',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 500,
    height: 40,
    maxWidth: '7ch',
    minWidth: '1ch',
    padding: 0,
    textAlign: 'right',
    width: 'auto',
    ':focus-visible': {
      color: 'oklch(96% 0.003 84.6)',
      outline: 'none',
    },
  },
  numberFieldInputActive: {
    color: 'oklch(96% 0.003 84.6)',
  },
  numberFieldRoot: {
    display: 'block',
    height: 48,
    padding: 4,
  },
  numberFieldSuffix: {
    color: 'oklch(86.4% 0.003 84.6 / 0.42)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 11,
  },
  numberFieldSuffixActive: {
    color: 'oklch(96% 0.003 84.6 / 0.64)',
  },
  numberFieldValue: {
    alignItems: 'center',
    display: 'flex',
    gap: 0,
    height: 40,
    justifyContent: 'center',
    minWidth: 0,
    position: 'absolute',
    pointerEvents: 'auto',
    right: 10,
    top: 0,
    zIndex: 3,
  },
  parameterGroup: {
    minWidth: 0,
  },
  page: {
    backgroundColor: '#07080d',
    display: 'grid',
    gridTemplateColumns: '300px minmax(400px, 1fr) 280px',
    minHeight: '100dvh',
    overflow: 'clip',
    '@media (max-width: 1080px)': {
      gridTemplateColumns: '260px minmax(320px, 1fr) 280px',
    },
    '@media (max-width: 960px)': {
      display: 'block',
      overflow: 'hidden',
    },
  },
  panel: {
    display: 'block',
    marginInline: 'auto',
    maxWidth: 820,
    paddingBottom: 44,
    paddingTop: 'calc(70px + clamp(24px, 4vh, 52px))',
    '@media (max-width: 960px)': {
      paddingTop: 24,
    },
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
    '@media (max-width: 960px)': {
      height: 'auto',
      left: 'auto',
      minHeight: 0,
      overflow: 'hidden',
      position: 'relative',
      top: 'auto',
      width: 'auto',
    },
  },
  pickerMeta: {
    alignSelf: 'flex-end',
    color: 'rgba(242, 232, 208, 0.38)',
    display: 'flex',
    flex: '0 0 auto',
    flexDirection: 'column',
    fontSize: 12,
    gap: 5,
    lineHeight: 1.45,
    marginRight: 24,
    marginTop: 16,
    textAlign: 'left',
    width: 180,
    '@media (max-width: 960px)': {
      marginBottom: 20,
      marginLeft: 16,
      marginRight: 16,
      width: 'auto',
    },
  },
  pickerMetaLink: {
    color: {
      default: 'rgba(242, 232, 208, 0.82)',
      ':hover': '#f2e8d0',
      ':focus-visible': '#ffffff',
    },
    textDecorationLine: 'underline',
    textDecorationThickness: 1,
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': {
      outline: 'none',
    },
  },
  pickerNavigation: {
    bottom: 16,
    display: 'flex',
    flexDirection: 'column',
    position: 'absolute',
    right: 0,
    top: 'calc(146px + clamp(24px, 4vh, 52px))',
    width: 204,
    '@media (min-width: 961px) and (max-width: 1080px)': {
      top: 'calc(156px + clamp(24px, 4vh, 52px))',
    },
    '@media (max-width: 960px)': {
      bottom: 'auto',
      position: 'relative',
      right: 'auto',
      top: 'auto',
      width: '100%',
    },
  },
  pickerWordmark: {
    alignSelf: 'flex-end',
    flex: '0 0 auto',
    marginRight: 24,
    '@media (max-width: 960px)': {
      alignSelf: 'flex-start',
      marginLeft: 16,
      marginRight: 0,
      marginTop: 20,
    },
  },
  planetPreviewTransition: {
    inset: 0,
    position: 'absolute',
    transformOrigin: 'center',
  },
  planetThumbnail: {
    flex: '0 0 auto',
    height: 40,
    overflow: 'visible',
    pointerEvents: 'none',
    position: 'relative',
    width: 40,
    '@media (max-width: 960px)': {
      height: 34,
      width: 34,
    },
  },
  planetThumbnailImage: {
    display: 'block',
    height: '100%',
    inset: 0,
    objectFit: 'contain',
    position: 'absolute',
    transition: 'filter 150ms ease-out',
    width: '100%',
  },
  planetThumbnailSelected: {
    filter: 'drop-shadow(0 0 6px rgba(242,232,208,0.22))',
  },
  planetList: {
    display: 'flex',
    flexShrink: 1,
    flexDirection: 'column',
    gap: 4,
    marginTop: 16,
    minHeight: 0,
    overflowY: 'auto',
    paddingRight: 24,
    scrollbarWidth: 'none',
    width: 204,
    '@media (max-width: 960px)': {
      alignItems: 'center',
      flexShrink: 0,
      flexDirection: 'row',
      gap: 8,
      height: 'auto',
      marginTop: 12,
      overflowX: 'auto',
      overflowY: 'hidden',
      paddingBlock: 13,
      paddingInline: 16,
      scrollSnapType: 'x proximity',
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
    display: 'grid',
    fontSize: 11,
    gap: 12,
    gridTemplateColumns: 'minmax(0, 1fr) 40px',
    lineHeight: 1.2,
    minHeight: 40,
    padding: 0,
    scrollSnapAlign: 'center',
    textAlign: 'right',
    textDecoration: { ':focus-visible': 'underline' },
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    whiteSpace: 'nowrap',
    width: 180,
    ':focus-visible': { outline: 'none' },
    '@media (max-width: 960px)': {
      display: 'flex',
      flex: '0 0 auto',
      flexDirection: 'column-reverse',
      fontSize: 9,
      gap: 3,
      minHeight: 60,
      padding: 4,
      textAlign: 'center',
      width: 68,
    },
  },
  planetTabSelected: {
    color: '#f2e8d0',
    fontWeight: 600,
  },
  resetButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(in oklch 180deg, color-mix(in oklch, var(--control-accent) 90%, white) 0%, color-mix(in oklch, var(--control-accent) 94%, black) 100%)',
    borderRadius: 8,
    borderWidth: 0,
    boxShadow: {
      default: 'oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset',
      ':focus-visible':
        'oklch(85.45% 0 0 / 0.2118) 0 1px 0 inset, 0 0 0 3px color-mix(in oklch, var(--control-accent) 22%, transparent)',
    },
    boxSizing: 'border-box',
    color: 'oklch(86.4% 0.003 84.6)',
    cursor: 'pointer',
    display: 'flex',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    fontSynthesis: 'none',
    gap: 6,
    justifyContent: 'center',
    lineHeight: '20px',
    marginTop: 16,
    overflowWrap: 'anywhere',
    paddingBlock: 8,
    paddingInline: 28,
    textAlign: 'center',
    width: '100%',
    ':focus-visible': {
      outline: 'none',
    },
  },
  resetButtonDisabled: {
    cursor: 'default',
    opacity: 0.45,
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
    inset: 0,
    opacity: 0,
    pointerEvents: 'none',
    position: 'absolute',
  },
  sliderIndicator: {
    backgroundColor: 'oklch(32.86% 0.0158 285.5)',
    borderRadius: 10,
    boxSizing: 'content-box',
    boxShadow:
      '2px 0 3px oklch(0% 0 0 / 0.18), inset 0 1px 0 oklch(100% 0 0 / 0.035), inset 0 -1px 1px oklch(0% 0 0 / 0.13)',
    height: '100%',
    left: 0,
    paddingRight: 10,
    position: 'absolute',
    top: 0,
    transition: 'background-color 140ms ease-out, box-shadow 140ms ease-out',
  },
  sliderIndicatorActive: {
    backgroundImage:
      'linear-gradient(90deg, transparent, color-mix(in oklch, var(--control-accent) 12%, transparent)), linear-gradient(180deg, color-mix(in oklch, var(--control-accent) 90%, white) 0%, color-mix(in oklch, var(--control-accent) 96%, white) 45%, color-mix(in oklch, var(--control-accent) 99%, black) 100%)',
    boxShadow:
      'inset 0 1px 0 oklch(100% 0 0 / 0.12), inset 1px 0 0 oklch(100% 0 0 / 0.08), inset 0 -1px 1px oklch(0% 0 0 / 0.22), 0 3px 4px color-mix(in oklch, var(--control-accent) 16%, transparent), 0 1px 2px color-mix(in oklch, var(--control-accent) 8%, transparent)',
  },
  sliderIndicatorAtMaximum: {
    paddingRight: 0,
  },
  sliderLabel: {
    color: 'oklch(86.4% 0.003 84.6 / 0.78)',
    fontSize: 12,
    fontWeight: 500,
    left: 14,
    minWidth: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'absolute',
    textOverflow: 'ellipsis',
    top: '50%',
    transform: 'translateY(-50%)',
    whiteSpace: 'nowrap',
    zIndex: 2,
  },
  sliderRoot: {
    height: 40,
    minWidth: 0,
    position: 'relative',
    width: '100%',
  },
  sliderSemanticThumb: {
    height: 1,
    width: 1,
  },
  sliderSemanticTrack: {
    height: '100%',
    width: '100%',
  },
  sliderThumb: {
    backgroundColor: 'oklch(52.46% 0.0171 285.8)',
    borderRadius: 2,
    boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 0.07), inset 0 -1px 1px oklch(0% 0 0 / 0.1)',
    height: 24,
    pointerEvents: 'none',
    position: 'absolute',
    top: 8,
    transition: 'box-shadow 140ms ease-out, transform 140ms ease-out',
    translate: '-50% 0',
    width: 4,
    zIndex: 2,
  },
  sliderThumbActive: {
    backgroundColor: 'transparent',
    backgroundImage:
      'linear-gradient(180deg, oklch(100% 0.004 293.76) 0%, oklch(98.5% 0.006 293.76) 58%, oklch(95.6% 0.012 293.76) 100%)',
    boxShadow:
      '0 1px 1px color-mix(in oklch, var(--control-accent) 25%, transparent), 0 0 0 0.5px color-mix(in oklch, var(--control-accent) 65%, transparent), inset 0 1px 0 oklch(100% 0 0 / 0.78)',
  },
  sliderTrack: {
    backgroundColor: 'oklch(20.07% 0.0199 284.46)',
    borderRadius: 10,
    boxShadow:
      '0 3px 7px oklch(0% 0 0 / 0.27), 0 1px 3px oklch(0% 0 0 / 0.2), inset 0 1px 0 oklch(100% 0 0 / 0.045), inset 0 -1px 1px oklch(0% 0 0 / 0.32), inset 1px 0 1px oklch(100% 0 0 / 0.025)',
    height: 40,
    overflow: 'hidden',
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    width: '100%',
  },
  stage: {
    borderRadius: 14,
    height: 'clamp(360px, 52vh, 590px)',
    overflow: 'hidden',
    position: 'relative',
  },
  summary: {
    color: 'rgba(242, 232, 208, 0.42)',
    fontSize: 13,
    lineHeight: 1.65,
    marginBottom: 0,
    marginTop: 8,
    maxWidth: 560,
  },
  switchLabel: {
    alignItems: 'center',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'oklch(100% 0 0 / 0.035)',
    },
    borderRadius: 8,
    color: 'oklch(86.4% 0.003 84.6 / 0.72)',
    cursor: 'pointer',
    display: 'flex',
    fontSize: 13,
    fontWeight: 500,
    height: 40,
    justifyContent: 'space-between',
    paddingInline: 8,
    transition: 'background-color 140ms ease-out',
  },
  switchRoot: {
    backgroundColor: 'oklch(75.04% 0.0128 286.09 / 0.32)',
    borderRadius: 999,
    borderWidth: 0,
    boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 0.12), 0 1px 2px oklch(0% 0 0 / 0.28)',
    cursor: 'pointer',
    display: 'block',
    flex: '0 0 auto',
    height: 24,
    position: 'relative',
    transition: 'background-color 300ms ease, box-shadow 300ms ease',
    width: 44,
    ':focus-visible': {
      boxShadow:
        'inset 0 1px 0 oklch(100% 0 0 / 0.12), 0 0 0 3px color-mix(in oklch, var(--control-accent) 22%, transparent)',
      outline: 'none',
    },
  },
  switchRootChecked: {
    backgroundColor: 'var(--control-accent)',
    boxShadow:
      'inset 0 1px 0 oklch(100% 0 0 / 0.18), 0 0 12px color-mix(in oklch, var(--control-accent) 30%, transparent)',
  },
  switchThumb: {
    backgroundColor: 'oklch(96% 0.004 84.6)',
    borderRadius: '50%',
    boxShadow: '0 2px 4px oklch(0% 0 0 / 0.28)',
    display: 'block',
    height: 20,
    left: 2,
    position: 'absolute',
    top: 2,
    transform: 'translateX(0)',
    transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    width: 20,
  },
  switchThumbChecked: {
    transform: 'translateX(20px)',
  },
  title: {
    backgroundClip: 'text',
    backgroundImage: 'linear-gradient(180deg, #ffffff 8%, rgba(242,232,208,0.82) 100%)',
    color: 'transparent',
    fontFamily: '"Inter Variable", Inter, sans-serif',
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
