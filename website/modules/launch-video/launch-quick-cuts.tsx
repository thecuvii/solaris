'use client'

import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Moon, LunarEclipse } from '@cuvii/solaris/moon'
import { Mercury } from '@cuvii/solaris/mercury'
import { Mars } from '@cuvii/solaris/mars'
import { Venus } from '@cuvii/solaris/venus'
import { Jupiter } from '@cuvii/solaris/jupiter'
import { Titan } from '@cuvii/solaris/titan'
import { Pluto } from '@cuvii/solaris/pluto'
import { Saturn } from '@cuvii/solaris/saturn'
import { Uranus } from '@cuvii/solaris/uranus'
import { Neptune } from '@cuvii/solaris/neptune'
import { Sun } from '@cuvii/solaris/sun'
import { useAtomValue } from 'jotai'
import { planetPresets } from '../planet-params/planet-params'
import { textures } from '../showcase/showcase-data'
import { launchTimeAtom } from './launch-playback-state'
import {
  celestialMotion,
  montageScale,
  montageCenterY,
  railScale,
  cutStart,
  shadowStart,
} from './launch-timeline'

function composition(size: number, rail: boolean) {
  const scaled = size * (rail ? railScale : montageScale)
  return {
    width: `${scaled}vh`,
    height: `${scaled}vh`,
    bottom: `${100 - montageCenterY * 100 - scaled / 2}vh`,
  }
}
const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

/** Pre-mounted shaders keep texture loading out of the rapid cuts. */
export function LaunchQuickCuts() {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot)
  const time = useAtomValue(launchTimeAtom)
  const motion = celestialMotion(time)
  const rail = time >= cutStart && time < shadowStart
  const light = {
    lean: false,
    spin: 0,
    yaw: motion.yaw,
    sunAzimuth: rail ? 0 : ((((90 - motion.sunAzimuth + 180) % 360) + 360) % 360) - 180,
    sunElevation: rail ? 0 : motion.sunElevation,
  }
  if (!mounted) return null
  return createPortal(
    <div className="launch-quick-cuts" aria-hidden="true">
      <div data-launch-cut="lunar-eclipse">
        <LunarEclipse
          {...planetPresets['lunar-eclipse'][1]!.values}
          textures={textures['lunar-eclipse']}
          composition={composition(225, rail)}
          lean={false}
          yaw={motion.yaw}
          sunAzimuth={0}
          sunElevation={0}
          exposure={1.35}
          refractedLightIntensity={2.2}
        />
      </div>
      <div data-launch-cut="moon">
        <Moon
          {...planetPresets.moon[0]!.values}
          textures={textures.moon}
          composition={composition(203, rail)}
          {...light}
          exposure={0.8}
          earthshineIntensity={1.5}
        />
      </div>
      <div data-launch-cut="mercury">
        <Mercury
          {...planetPresets.mercury[0]!.values}
          textures={textures.mercury}
          composition={composition(203, rail)}
          {...light}
        />
      </div>
      <div data-launch-cut="mars">
        <Mars
          {...planetPresets.mars[0]!.values}
          textures={textures.mars}
          composition={composition(209, rail)}
          {...light}
          exposure={1.15}
        />
      </div>
      <div data-launch-cut="venus">
        <Venus
          {...planetPresets.venus[0]!.values}
          textures={textures.venus}
          composition={composition(214, rail)}
          {...light}
          exposure={0.72}
          cloudContrast={0.75}
          cloudDetail={0.35}
          opticalDepth={0.35}
          upperHaze={0.15}
          sulfurTint={0.45}
          flowStrength={0.3}
        />
      </div>
      <div data-launch-cut="jupiter">
        <Jupiter
          {...planetPresets.jupiter[0]!.values}
          textures={textures.jupiter}
          composition={composition(216, rail)}
          {...light}
        />
      </div>
      <div data-launch-cut="titan">
        <Titan
          {...planetPresets.titan[0]!.values}
          composition={composition(225, rail)}
          {...light}
          exposure={0.65}
          hazeDensity={0.02}
          hazeThickness={0.15}
          detachedHaze={0.02}
          forwardScattering={0.2}
          bandContrast={0.7}
          polarHood={0.65}
        />
      </div>
      <div data-launch-cut="saturn">
        <Saturn
          {...planetPresets.saturn[0]!.values}
          textures={textures.saturn}
          composition={composition(225, rail)}
          {...light}
          tilt={30}
        />
      </div>
      <div data-launch-cut="uranus">
        <Uranus
          {...planetPresets.uranus[0]!.values}
          composition={composition(215, rail)}
          {...light}
          sunElevation={90}
        />
      </div>
      <div data-launch-cut="neptune">
        <Neptune
          {...planetPresets.neptune[0]!.values}
          composition={composition(215, rail)}
          {...light}
        />
      </div>
      <div data-launch-cut="sun">
        <Sun
          {...planetPresets.sun[0]!.values}
          textures={textures.sun}
          composition={composition(230, rail)}
          lean={false}
          spin={0}
          yaw={motion.yaw}
        />
      </div>
      <div data-launch-cut="pluto">
        <Pluto
          {...planetPresets.pluto[0]!.values}
          textures={textures.pluto}
          composition={composition(203, rail)}
          {...light}
        />
      </div>
    </div>,
    document.body,
  )
}
