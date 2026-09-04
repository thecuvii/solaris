# Solaris website

Next.js 16 App Router showcase for `@thecuvii/solaris`.

```sh
pnpm --filter website dev
pnpm --filter website build
```

`next build` writes a static site to `out/` (`output: 'export'`). Each planet is prerendered from `src/app/[planet]/page.tsx` with its own title, description, and canonical URL.
