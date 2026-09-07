# Solaris website

Next.js 16 App Router showcase for `@cuvii/solaris`.

```sh
pnpm --filter website dev
pnpm --filter website build
```

`next build` writes a static site to `out/` (`output: 'export'`).

- `app/layout.tsx` is the document shell.
- `app/(showcase)/layout.tsx` keeps the picker, inspector, and page chrome mounted across planet routes.
- On mobile (`≤960px`) `modules/showcase/planet-dock.tsx` renders the planet strip and settings as one always-open Base UI drawer: parked at its lowest snap point it is a floating pill holding the strip and a settings button; lifting it morphs the pill into the sheet.
- Each planet is its own route (`earth/page.tsx`, `moon/page.tsx`, …) and composes a `PlanetPreview` around that planet's scene. `/` redirects to `/earth/`.
