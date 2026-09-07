![Solaris — React shader effects for the solar system](https://solaris.cuvii.dev/og.png)

# Solaris

React components for rendering the solar system with physically styled shader effects.

- Fourteen celestial scenes, from textured rocky bodies to procedural atmospheres
- Responsive composition, pointer lean, rotation, and directional lighting controls
- Per-component entry points so applications only import the effects they use
- Automatic offscreen pausing, WebGL context recovery, and reduced-motion support

## Install

```sh
pnpm add @cuvii/solaris
```

Solaris requires React and React DOM 19.2 or newer.

## Quick start

Each component is a client component and renders into a WebGL2 canvas. Import it
from its own entry point for the smallest bundle:

```tsx
'use client'

import { Moon } from '@cuvii/solaris/moon'

export function MoonPreview() {
  return (
    <Moon
      textures={{
        albedo: '/textures/moon-albedo.webp',
        normalHeight: '/textures/moon-normal-height.webp',
      }}
      spin={0.5}
      sunAzimuth={35}
      sunElevation={15}
      style={{ height: 400, width: 400 }}
    />
  )
}
```

Texture files are not included in the package. Host them in your application or
on a CORS-enabled remote origin and pass their URLs to the component.

## API

### Components

| Component      | Import                   | Required `textures`                                        | Capabilities                                             |
| -------------- | ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------- |
| `Earth`        | `@cuvii/solaris/earth`   | `cloud`, `day`, `material`, `night`, `normal`, `roughness` | Canvas, pose, lighting, lifecycle                        |
| `Jupiter`      | `@cuvii/solaris/jupiter` | `albedo`                                                   | Canvas, pose, lighting, lifecycle                        |
| `Mars`         | `@cuvii/solaris/mars`    | `albedo`, `normalHeight`                                   | Canvas, pose, lighting, lifecycle                        |
| `Mercury`      | `@cuvii/solaris/mercury` | `albedo`, `normalHeight`                                   | Canvas, pose, lighting, lifecycle                        |
| `Moon`         | `@cuvii/solaris/moon`    | `albedo`, `normalHeight`                                   | Canvas, pose, lighting, lifecycle                        |
| `LunarEclipse` | `@cuvii/solaris/moon`    | `albedo`, `normalHeight`                                   | Canvas, `yaw`/`tilt`, eclipse direction, lifecycle       |
| `Neptune`      | `@cuvii/solaris/neptune` | None (procedural)                                          | Canvas, pose, lighting, lifecycle                        |
| `Pluto`        | `@cuvii/solaris/pluto`   | `albedo`, `normalHeight`                                   | Canvas, pose, lighting, lifecycle                        |
| `Saturn`       | `@cuvii/solaris/saturn`  | `atmosphere`, `rings`                                      | Canvas, pose, lighting, lifecycle                        |
| `Sky`          | `@cuvii/solaris/sky`     | None (procedural)                                          | Canvas                                                   |
| `Sun`          | `@cuvii/solaris/sun`     | `observation`                                              | Canvas, `yaw`/`spin`, lifecycle                          |
| `Titan`        | `@cuvii/solaris/titan`   | None (procedural)                                          | Canvas, pose, lighting, lifecycle                        |
| `Uranus`       | `@cuvii/solaris/uranus`  | None (procedural)                                          | Canvas, `yaw`/`spin`, pole controls, lighting, lifecycle |
| `Venus`        | `@cuvii/solaris/venus`   | `cloudStructure`                                           | Canvas, pose, lighting, lifecycle                        |

The package root also exports every component, but the per-component entry points
make the bundle boundary explicit. Each entry point exports its component,
matching `*Props` type, texture type when applicable, and the shared types it uses.

Every visual control is typed and documented with its unit, useful range, and
default in JSDoc. Use the exported props type or editor autocomplete for the full
set of body-specific atmosphere, surface, ring, and exposure controls.

### Canvas and layout

These fields come from `OrbCanvasProps` and apply to every component unless noted.

| Prop          | Type                     | Default | Description                                                          |
| ------------- | ------------------------ | ------- | -------------------------------------------------------------------- |
| `className`   | `string`                 | —       | Class name for the outermost element                                 |
| `style`       | `CSSProperties`          | —       | Inline styles for the outermost element                              |
| `composition` | `OrbComposition`         | —       | Size and vertical position of the body inside the canvas             |
| `viewport`    | `OrbViewport`            | —       | Extra canvas bleed around `composition`                              |
| `lean`        | `boolean`                | `true`  | Follow the pointer with a subtle parallax lean; unavailable on `Sky` |
| `paused`      | `boolean`                | `false` | Stop the render loop                                                 |
| `onError`     | `(error: Error) => void` | —       | Receive renderer or source failures                                  |

`OrbComposition` contains required `width` and `height` CSS values plus an optional
`bottom`. It is horizontally centred. Without it, the body fills the shorter side
of the canvas.

`OrbViewport` accepts CSS `top`, `right`, `bottom`, and `left` values and is only
used with `composition`. Negative values grow the canvas so rings, glow, and
atmosphere are not clipped:

```tsx
<Saturn
  composition={{ bottom: 40, height: 480, width: 480 }}
  viewport={{ bottom: -120, left: -120, right: -120, top: -120 }}
  textures={textures}
/>
```

### Pose and lighting

| Prop           | Unit               | Description                                                                |
| -------------- | ------------------ | -------------------------------------------------------------------------- |
| `yaw`          | degrees            | Rotation about the polar axis                                              |
| `tilt`         | degrees            | Axial tilt towards the viewer                                              |
| `spin`         | degrees per second | Continuous rotation added to `yaw`                                         |
| `sunAzimuth`   | degrees            | Light around the vertical axis; `0` is front and `±90` is from either side |
| `sunElevation` | degrees            | Light height above the equatorial plane; negative values light from below  |

Most bodies support all five fields. The exceptions are:

- `LunarEclipse` has no `spin`; its sun angles move Earth's shadow across the Moon.
- `Neptune` uses `tilt` to rotate its weather map without changing lighting geometry.
- `Sun` has `yaw` and `spin`, but no `tilt` or lighting controls.
- `Uranus` has `yaw` and `spin`; use `poleAzimuth` and `poleElevation` for its pole.
- `Sky` has no pose or lighting group; its own `sunElevation` controls the observed Sun.

### Source lifecycle

Textured and generated-source components accept `SourceLifecycleProps`:

| Prop             | Type                                                | Description                                                      |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| `onStatusChange` | `(status: 'loading' \| 'ready' \| 'error') => void` | Receive every source state transition                            |
| `onReady`        | `() => void`                                        | Run when images are decoded or generated data is available       |
| `onError`        | `(error: Error) => void`                            | Receive texture, shader, framebuffer, or invalid-source failures |

`ready` means source data is available; GPU upload follows on the next frame.
Renderer errors leave the canvas blank and do not escape into the React tree.
`Sky` is fully procedural in one render pass and does not expose source lifecycle
callbacks.

### Textures and preloading

Texture objects are keyed by URL values, so inline objects are safe and do not
rebuild the renderer while their strings remain unchanged. Remote texture servers
must allow anonymous cross-origin image requests.

Import `preloadTextureImages` from the package root to warm the shared image cache:

```ts
import { preloadTextureImages } from '@cuvii/solaris'

await preloadTextureImages(['/textures/moon-albedo.webp', '/textures/moon-normal-height.webp'])
```

### Earth atmosphere model

`Earth` uses `defaultEarthModel` unless you provide a different scattering model.
The preset and its types are exported from the Earth entry point:

```tsx
import {
  Earth,
  defaultEarthModel,
  type AtmosphericOrbModel,
  type EarthProps,
} from '@cuvii/solaris/earth'

const model: AtmosphericOrbModel = {
  ...defaultEarthModel,
  sunIntensity: 20,
}

export function CustomEarth(props: EarthProps) {
  return <Earth {...props} model={model} />
}
```

## Runtime behavior

- WebGL2 is required. Without it, the canvas stays blank and no error is thrown
  into React.
- Rendering pauses while the canvas is outside the viewport.
- Rendering pauses on WebGL context loss and resumes after the context is restored.
- Under `prefers-reduced-motion`, time is frozen, pointer lean is disabled, and the
  component redraws only when its props or size change.

## Development

`src/` contains the publishable package. `website/` contains the Next.js showcase
and its hosted demo textures.

```sh
pnpm install
pnpm dev
```

Run the project checks with:

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium # once
pnpm test
pnpm build:website
```

Build before testing: `src/dist.test.ts` inspects the emitted bundles and is
skipped when `dist/` is missing.

## Releasing

Releases are cut from tags and published with npm trusted publishing.

1. Add an entry to `CHANGELOG.md` under `## [x.y.z](...) (YYYY-MM-DD)`.
2. Bump `version` in `package.json` to match and commit.
3. Tag and push: `git tag vx.y.z && git push origin main vx.y.z`.

The `Publish` workflow verifies the version, runs checks, tests, and the bundle
size budget, publishes to npm, and creates the matching GitHub release.

## Credits and prior art

Texture provenance for the showcase is recorded in
[`website/public/textures/v1/CREDITS.md`](website/public/textures/v1/CREDITS.md).

- [Cobe](https://cobe.vercel.app/) — Shu Ding
- [Spherium](https://www.tryspherium.com/) — Javier Crocco
- [GPS 01](https://gps-01.dmytro.fyi/) — Dmytro Kondakov
- [On Rendering the Sky, Sunsets and Planets](https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/) — Maxime Heckel
