/**
 * A local origin for browser tests: serve the **real built bundle** and proxy
 * the API, all on one same-origin port.
 *
 * Why this exists
 * ---------------
 * The deployed studio sits behind a bot-protection layer that challenges
 * automated browsers, so driving it with headless Chromium gets an interstitial
 * instead of the app. The fix is not to defeat that layer — it is to take it out
 * of the path. This server serves the same `dist` output nginx serves, and
 * forwards `/api/*` and `/health` to the live API from the server process, so:
 *
 *   - the browser talks only to `127.0.0.1`, and never loads a challenge page;
 *   - the bundle is a genuine production build, not a dev-server render;
 *   - API requests still hit the real deployed API, so the contract under test
 *     is the production one.
 *
 * Pair it with a relative API base:
 *   bun run build:test        # VITE_API_BASE=/api/v1, outDir dist-test
 *   bun run test:serve &
 *   STUDIO_URL=http://127.0.0.1:8787 bun run scripts/e2e-studio.ts
 */

import { join, normalize } from 'node:path'
import { existsSync, statSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = process.env.DIST_DIR ?? join(ROOT, 'dist-test')
const PORT = Number(process.env.PORT ?? 8787)
const UPSTREAM = (process.env.UPSTREAM ?? 'https://api.zolai.space').replace(/\/+$/, '')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

const contentType = (path: string): string =>
  MIME[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream'

/** Resolve a request path to a file inside DIST, refusing to escape it. */
function resolveFile(pathname: string): string | null {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const candidate = join(DIST, clean)
  if (!candidate.startsWith(DIST)) return null
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  // SPA fallback: any unknown path is a client route, not a 404.
  const index = join(DIST, 'index.html')
  return existsSync(index) ? index : null
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 60,

  async fetch(request) {
    const url = new URL(request.url)

    // --- API + health: forwarded to the live API, credentials intact ---
    if (url.pathname.startsWith('/api') || url.pathname === '/health') {
      const headers = new Headers(request.headers)
      // The browser is same-origin here, so no Origin is forwarded upstream.
      headers.delete('origin')
      headers.delete('host')
      headers.set('host', new URL(UPSTREAM).host)
      try {
        const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
          method: request.method,
          headers,
          body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
          // Bun requires this when streaming a body through.
          ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { duplex: 'half' }),
        } as RequestInit)
        const out = new Headers(upstream.headers)
        // The API answers CORS for its own hosts; same-origin needs none.
        out.delete('access-control-allow-origin')
        out.delete('access-control-allow-credentials')
        // `fetch` has already decoded the body, so re-advertising the upstream's
        // content-encoding makes the browser fail with ERR_CONTENT_DECODING_FAILED
        // against a plain-text payload. Same for a length that no longer matches.
        out.delete('content-encoding')
        out.delete('content-length')
        out.delete('transfer-encoding')
        return new Response(upstream.body, { status: upstream.status, headers: out })
      } catch (error) {
        return new Response(
          JSON.stringify({ detail: `test-origin could not reach ${UPSTREAM}: ${String(error)}` }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        )
      }
    }

    // --- static assets ---
    const file = resolveFile(url.pathname)
    if (!file) return new Response('not found', { status: 404 })
    return new Response(Bun.file(file), {
      headers: {
        'content-type': contentType(file),
        'cache-control': 'no-store',
      },
    })
  },
})

console.log(`test origin   http://127.0.0.1:${server.port}`)
console.log(`  serving     ${DIST}`)
console.log(`  proxying    ${UPSTREAM}/api/*  and  ${UPSTREAM}/health`)
console.log(`  use with    STUDIO_URL=http://127.0.0.1:${server.port} bun run scripts/e2e-studio.ts`)
