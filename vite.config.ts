import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Zolai Explorer — Studio workbench for the live Zolai Core API.
 *
 * `base: '/explorer/'` serves the SPA from https://api.zolai.space/explorer/
 * alongside the FastAPI surface. Dev requests for `/api/*` and `/health` are
 * proxied to the same origin so local dev and production behave identically.
 */
const UPSTREAM = process.env.ZOLAI_UPSTREAM ?? 'https://api.zolai.space'

export default defineConfig({
  base: '/explorer/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: UPSTREAM, changeOrigin: true, secure: true },
      '/health': { target: UPSTREAM, changeOrigin: true, secure: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})