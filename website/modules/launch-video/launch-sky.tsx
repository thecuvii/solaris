'use client'

import { skyAt, endCardStart, progress, settle, sunToLogoStart } from './launch-timeline'

/** Keep the real Sky page mounted throughout the UI reveal and preset morph. */
export function LaunchSky({ time }: { time: number }) {
  const state = skyAt(time)
  const logoReveal = progress(time, sunToLogoStart, sunToLogoStart + 0.35)
  const shadow = progress(time, endCardStart + 0.3, endCardStart + 1.15)
  const title = settle(time, endCardStart + 0.3, endCardStart + 0.9)
  const urlReveal = progress(time, endCardStart + 1.08, endCardStart + 1.48)
  const color = progress(time, sunToLogoStart + 0.5, endCardStart + 0.55)
  return (
    <>
      <div className="launch-sky" style={{ opacity: state.opacity }} aria-hidden="true">
        <iframe
          title="Sky showcase capture"
          sandbox="allow-scripts allow-same-origin"
          src="/sky/launch/?capture=1"
          tabIndex={-1}
        />
      </div>
      <div className="launch-end-card" style={{ opacity: logoReveal }}>
        <div className="launch-brand-grid">
          <svg
            className="launch-brand-logo"
            viewBox="-1 -1 13 13"
            aria-label="Solaris logo"
            role="img"
          >
            <defs>
              <linearGradient id="launch-sun-color" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e8d782" />
                <stop offset="1" stopColor="#df9b81" />
              </linearGradient>
              <mask
                id="launch-brand-shadow"
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width="11"
                height="11"
              >
                <circle cx="5.5" cy="5.5" r="5.5" fill="white" />
                <circle cx={5.5 - 3 * shadow} cy={5.5 - 2 * shadow} r="5.5" fill="black" />
              </mask>
            </defs>
            <circle cx="5.5" cy="5.5" r="5.5" fill="url(#launch-sun-color)" />
            <circle cx="5.5" cy="5.5" r="5.5" fill="#f2e8d0" opacity={color} />
            <circle
              cx="5.5"
              cy="5.5"
              r="5.5"
              fill="#101112"
              fillOpacity=".52"
              mask="url(#launch-brand-shadow)"
            />
          </svg>
          <div className="launch-brand-title-window">
            <div
              className="launch-brand-title"
              style={{ transform: `translateY(${(1 - title) * 115}%)` }}
            >
              SOLARIS
            </div>
          </div>
        </div>
        <p className="launch-brand-url" style={{ opacity: urlReveal }}>
          https://solaris.cuvii.dev
        </p>
      </div>
    </>
  )
}
