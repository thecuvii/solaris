import stylex from '@stylexjs/unplugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

const planetPages = [
  'earth',
  'jupiter',
  'lunar-eclipse',
  'mars',
  'mercury',
  'moon',
  'neptune',
  'observed-sun',
  'pluto',
  'saturn',
  'sun',
  'titan',
  'uranus',
  'venus',
].map((planet) => ({ path: `/${planet}` }))

export default defineConfig(({ command }) => ({
  resolve: {
    dedupe: ['react', 'react-dom'],
    tsconfigPaths: true,
  },
  server: { allowedHosts: true },
  plugins: [
    stylex.vite({
      dev: process.env.NODE_ENV === 'development',
      runtimeInjection: false,
      useCSSLayers: true,
    }),
    tanstackStart({
      spa: {
        enabled: true,
      },
      prerender: {
        crawlLinks: true,
        enabled: true,
      },
      pages: [{ path: '/' }, ...planetPages],
    }),
    command === 'build'
      ? nitro({
          preset: 'cloudflare_module',
          compatibilityDate: '2026-09-01',
          cloudflare: {
            deployConfig: true,
            nodeCompat: true,
            wrangler: {
              name: 'solaris',
            },
          },
          rollupConfig: { external: [/^@sentry\//] },
        })
      : undefined,
    viteReact(),
  ],
}))
