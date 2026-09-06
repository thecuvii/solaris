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
pnpm test
pnpm build
pnpm build:website
```

## Usage

Textures are supplied by the consumer rather than bundled with the package.

```tsx
import { Moon } from '@thecuvii/solaris/moon'

;<Moon
  textures={{
    albedo: 'https://example.com/moon-albedo.webp',
    normalHeight: 'https://example.com/moon-normal-height.webp',
  }}
/>
```

Texture provenance for the documentation examples is recorded in
`website/public/textures/v1/CREDITS.md`.

## See also

- [Cobe](https://cobe.vercel.app/) — Shu Ding
- [Spherium](https://www.tryspherium.com/) — Javier Crocco
- [GPS 01](https://gps-01.dmytro.fyi/) — Dmytro Kondakov
- [On Rendering the Sky, Sunsets and Planets](https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/) — Maxime Heckel
