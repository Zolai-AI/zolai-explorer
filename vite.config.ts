import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Zolai Explorer — Studio workbench for the live Zolai Core API.
 *
 * `base: '/'` serves the SPA from its own host, https://studio.zolai.space/,
 * where nginx owns `root /var/www/zolai-studio` and falls back to /index.html.
 * The bundle is therefore cross-origin from the API, so production builds pin
 * an absolute `VITE_API_BASE` (see `.env.production`).
 *
 * Dev requests for `/api/*` and `/health` are proxied to the API host, so the
 * relative default in `src/lib/api.ts` keeps local dev same-origin.
 */
const UPSTREAM = process.env.ZOLAI_UPSTREAM ?? 'https://api.zolai.space'

export default defineConfig({
  base: '/',
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