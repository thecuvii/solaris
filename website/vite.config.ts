import stylex from '@stylexjs/unplugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
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

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    tsconfigPaths: true,
  },
  preview: { host: '127.0.0.1' },
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
        crawlLinks: false,
        enabled: true,
      },
      pages: [{ path: '/' }, ...planetPages],
    }),
    viteReact(),
  ],
})
