import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Sky } from '../../src/sky/index.ts'

// User-supplied Sky settings, rendered directly in WebGL.
createRoot(document.getElementById('sky')).render(
  createElement(Sky, {
    cloudStreaks: 0,
    duskFlush: 0,
    exposure: 1.8,
    field: 0,
    flare: 0.02,
    flareAngle: 63,
    flareRays: 0.56,
    flareStar: 0.25,
    glare: 0.14,
    haze: 0.55,
    ozone: 0.69,
    saturation: 0.9,
    refraction: 0.5,
    seeingAmount: 0.29,
    seeingSpeed: 0.76,
    streakDrift: 2.19,
    sunElevation: 3,
    sunScale: 0.026,
    onError(error) {
      throw error
    },
    style: { width: '100%', height: '100%' },
  }),
)
