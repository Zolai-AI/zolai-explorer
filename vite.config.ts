import { fileURLToPath } from 'node:url'
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
  resolve: {
    // shadcn/ui resolves every component through the `@/` alias (components.json).
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        /*
         * Vendor splitting. The whole app shipped as one ~1.37MB chunk, which a
         * phone has to download before it can paint anything. Route-level
         * React.lazy is the bigger win but it cannot work here: the test
         * suite renders pages with react-dom/server, and a suspended lazy
         * component cannot be resolved synchronously, so it would throw.
         *
         * Splitting the vendors instead gets the same parallelism and caching
         * (unchanged deps stay cached across deploys) without touching a single
         * component, so all the render tests keep passing.
         *
         * recharts is the one worth calling out: it is only reachable from the
         * dashboard/data charts, but it was the single largest contributor to
         * the initial payload.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](recharts|d3-|victory-|internmap|delaunator|robust-predicates)[\\/]/.test(id)) {
            return 'charts'
          }
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return 'react'
          }
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'tanstack'
          if (/[\\/]node_modules[\\/](@radix-ui|radix-ui|cmdk)[\\/]/.test(id)) return 'radix'
          if (/[\\/]node_modules[\\/](zod|@hookform|react-hook-form)[\\/]/.test(id)) return 'forms'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: UPSTREAM, changeOrigin: true, secure: true },
      '/health': { target: UPSTREAM, changeOrigin: true, secure: true },
    },
  },
  test: {
    // 'node' on purpose: the render tests use `react-dom/server`, so no DOM
    // implementation is needed and the suite stays fast and dependency-free.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})