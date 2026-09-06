# Solaris

React shader effects for the solar system.

## Workspace

- `src/` contains the publishable `@thecuvii/solaris` package.
- `website/` contains the Next.js 16 documentation site and hosted demo textures.

## Development

```sh
pnpm install
pnpm dev
```

Run static checks, tests, and the package build with:

```sh
pnpm check
pnpm build
pnpm test
pnpm build:website
```

Build before testing: `src/dist.test.ts` inspects the emitted bundles and is
skipped when `dist/` is missing.

## Usage

```sh
pnpm add @thecuvii/solaris
```

Every component is a client component and renders into a WebGL2 canvas. Import
from the per-planet subpath so only that planet's shader ships in your bundle.

```tsx
import { Moon } from '@thecuvii/solaris/moon'

;<Moon
  textures={{
    albedo: 'https://example.com/moon-albedo.webp',
    normalHeight: 'https://example.com/moon-normal-height.webp',
  }}
/>
```

Textures are supplied by the consumer rather than bundled with the package.
Texture URLs are compared by value, so inline `textures` objects are fine.
Warm the shared cache ahead of mount with `preloadTextureImages(urls)`.

### Loading state

Textured planets accept `onStatusChange`, `onReady`, and `onError`. `ready`
means the images are decoded; the GPU upload follows on the next frame.

```tsx
;<Moon textures={textures} onStatusChange={setStatus} onError={console.error} />
```

### Browser support

WebGL2 is required. When the context is unavailable the canvas stays blank and
no error is thrown. If the browser loses the context (for example after a GPU
reset) rendering pauses and resumes automatically once it is restored.

Texture provenance for the documentation examples is recorded in
`website/public/textures/v1/CREDITS.md`.

## Releasing

Releases are cut from tags and published with npm trusted publishing.

1. Add an entry to `CHANGELOG.md` under `## [x.y.z](...) (YYYY-MM-DD)`.
2. Bump `version` in `package.json` to match and commit.
3. Tag and push: `git tag vx.y.z && git push origin main vx.y.z`.

The `Publish` workflow verifies the tag against `package.json`, runs checks,
tests, and the size budget, publishes to npm, and creates a GitHub release with
the matching changelog section.

## See also

- [Cobe](https://cobe.vercel.app/) — Shu Ding
- [Spherium](https://www.tryspherium.com/) — Javier Crocco
- [GPS 01](https://gps-01.dmytro.fyi/) — Dmytro Kondakov
- [On Rendering the Sky, Sunsets and Planets](https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/) — Maxime Heckel
