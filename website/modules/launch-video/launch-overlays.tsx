'use client'

import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useAtomValue } from 'jotai'
import NumberFlow, { continuous } from '@number-flow/react'
import { numberFlowFormat, numberFlowTimings } from '../showcase/setting-format'
import { launchTimeAtom } from './launch-playback-state'
import { progress, shotAt, railPlanets, railTravel, sunToLogoStart } from './launch-timeline'
import { planets } from '../showcase/showcase-data'
import { LaunchSky } from './launch-sky'

const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false
const properties = ['sunAzimuth', 'sunElevation', 'cityLights'] as const

export function LaunchOverlays() {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot)
  const time = useAtomValue(launchTimeAtom)
  const { settings, blackout, rail } = shotAt(time)
  const travel = railTravel(time)
  const selected = Math.round(travel)
  const rows = Array.from({ length: 9 }, (_, index) => {
    const slot = selected + index - 4
    const body =
      railPlanets[((slot % railPlanets.length) + railPlanets.length) % railPlanets.length]!
    return { slot, body, name: planets.find((planet) => planet.id === body)?.name ?? body }
  })
  if (!mounted) return null
  return createPortal(
    <>
      <LaunchSky time={time} />
      <div
        className="launch-blackout"
        style={{
          opacity:
            time >= sunToLogoStart
              ? progress(time, sunToLogoStart, sunToLogoStart + 0.5)
              : blackout
                ? 1
                : 0,
        }}
        aria-hidden="true"
      />
      <div className="launch-navigation" style={{ opacity: rail ? 1 : 0 }} aria-hidden="true">
        <span className="launch-navigation-anchor">
          {rows[4]!.name}
          <span className="launch-navigation-indicator" />
        </span>
        {rows.map(({ slot, body, name }) => (
          <div
            key={slot}
            className="launch-navigation-row"
            data-selected={slot === selected}
            data-planet={body}
            style={{ transform: `translateY(${(travel - slot) * 86}px)` }}
          >
            {name}
          </div>
        ))}
      </div>
      <pre
        className="launch-code"
        style={{ opacity: progress(time, 1.95, 2.15) * (1 - progress(time, 4.05, 4.4)) }}
      >
        <code>
          <span className="launch-code-punctuation">{'<'}</span>
          <span className="launch-code-tag">Earth</span>
          {'\n'}
          {properties.map((property) => {
            const active =
              property === 'cityLights' ? time >= 3.15 && time <= 3.8 : time >= 2.2 && time <= 2.95
            return (
              <span className="launch-code-line" key={property}>
                {'  '}
                <span className="launch-code-prop">{property}</span>
                {'={'}
                <span className="launch-code-value" data-active={active}>
                  <NumberFlow
                    value={Number(settings[property])}
                    format={numberFlowFormat(property === 'cityLights' ? 2 : 0)}
                    plugins={[continuous]}
                    isolate
                    willChange
                    {...numberFlowTimings}
                  />
                </span>
                {'}\n'}
              </span>
            )
          })}
          <span className="launch-code-punctuation">{'  ...\n/>'}</span>
        </code>
      </pre>
      <div className="launch-cursor" aria-hidden="true">
        <span className="launch-cursor-press" />
        <svg width="32" height="40" viewBox="0 0 32 40" fill="none">
          <path
            d="M3 2L4 31L11 24L17 37L23 34L17 22L28 21L3 2Z"
            fill="white"
            stroke="#15171d"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>,
    document.body,
  )
}
