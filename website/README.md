# Solaris website

Next.js 16 App Router showcase for `@thecuvii/solaris`.

```sh
pnpm --filter website dev
pnpm --filter website build
```

`next build` writes a static site to `out/` (`output: 'export'`).

- `app/layout.tsx` is the document shell.
- `app/(showcase)/layout.tsx` keeps the picker, wheel, inspector, and page chrome mounted across planet routes.
- Each planet is its own route (`earth/page.tsx`, `moon/page.tsx`, …) and composes a `PlanetPreview` around that planet's scene. `/` redirects to `/earth/`.
