/**
 * Security-header contract for the static host (issue #1).
 *
 * There is no backend here: nginx is the only layer that can send HSTS, CSP,
 * X-Frame-Options, X-Content-Type-Options, Referrer-Policy and
 * Permissions-Policy, so `deploy/nginx/zolai-explorer.conf` is the source of
 * truth and this file pins the two things that rot silently:
 *
 *  1. the CSP `script-src` hash — `index.html` carries exactly one inline
 *     script (the pre-paint theme bootstrap). Edit it and the deployed CSP
 *     stops matching, which means the theme bootstrap is blocked and every
 *     first paint flashes light. The hash is recomputed here from the source
 *     file, so a drift fails the suite instead of failing in production;
 *  2. header placement — nginx REPLACES inherited `add_header` lines as soon
 *     as a `location` declares one, so the two Cache-Control locations must
 *     repeat the whole set, and HSTS must not appear in the plain-HTTP block.
 *
 * Node-only (fs + crypto), no DOM.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoFile = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')

const INDEX_HTML = repoFile('index.html')
const CONF = repoFile('deploy/nginx/zolai-explorer.conf')

/** Inline scripts only — `<script src=…>` is Vite's own module entry. */
const inlineScripts = (html: string): string[] =>
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1])

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64')

const REQUIRED_HEADERS = [
  'Strict-Transport-Security',
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
] as const

/** The three header groups that must each declare the full set. */
const BLOCKS = {
  server: /server \{\s*listen 443 ssl[\s\S]*?\n\}/,
  assets: /location \/assets\/ \{[\s\S]*?\n    \}/,
  entry: /location = \/index\.html \{[\s\S]*?\n    \}/,
} as const

describe('index.html — one inline script, allowed by hash', () => {
  it('has exactly one inline script (the theme bootstrap)', () => {
    expect(inlineScripts(INDEX_HTML)).toHaveLength(1)
  })

  it('is small enough to be the bootstrap, not a bundle', () => {
    const [script] = inlineScripts(INDEX_HTML)
    expect(script).toContain('zolai.theme')
    expect(script.length).toBeLessThan(4096)
  })
})

describe('deploy/nginx — the header set is complete', () => {
  it('declares every header in the TLS server block', () => {
    const block = CONF.match(BLOCKS.server)
    expect(block, 'TLS server block not found').not.toBeNull()
    for (const header of REQUIRED_HEADERS) {
      expect(block?.[0], `${header} missing from the TLS server block`).toContain(
        `add_header ${header} `,
      )
    }
  })

  it('repeats the set where nginx would otherwise drop it', () => {
    // Each of these locations declares a Cache-Control `add_header`, which
    // cancels inheritance from the server block — without the repeats the
    // document and the hashed assets ship with no CSP at all.
    for (const name of ['assets', 'entry'] as const) {
      const block = CONF.match(BLOCKS[name])
      expect(block, `location block "${name}" not found`).not.toBeNull()
      for (const header of REQUIRED_HEADERS) {
        expect(block?.[0], `${header} missing from location "${name}"`).toContain(
          `add_header ${header} `,
        )
      }
      expect(block?.[0]).toContain('Cache-Control')
    }
  })

  it('never sends HSTS over plain HTTP', () => {
    const [first, ...rest] = CONF.split('server {')
    expect(rest.length, 'expected two server blocks').toBe(2)
    // Block 1 = :80 (ACME + redirect), block 2 = :443.
    expect(first).not.toMatch(/Strict-Transport-Security/)
    expect(rest[0]).toMatch(/listen 80/)
    expect(rest[0]).not.toContain('Strict-Transport-Security')
    expect(rest[1]).toContain('Strict-Transport-Security')
  })

  it('keeps the SPA fallback and the well-known-file ordering intact', () => {
    expect(CONF).toMatch(/try_files \$uri \$uri\/ \/index\.html;/)
  })
})

describe('deploy/nginx — the CSP itself', () => {
  /** The `script-src` directive as shipped, from the TLS server block. */
  const scriptSrc = (): string => {
    const block = CONF.match(BLOCKS.server)?.[0] ?? ''
    const directive = block.match(/script-src ([^;]+);/)
    expect(directive, 'script-src directive not found').not.toBeNull()
    return directive?.[1] ?? ''
  }

  const policy = (): string => CONF.match(BLOCKS.server)?.[0].match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? ''

  it('pins the inline theme bootstrap by sha256, not by unsafe-inline', () => {
    const [script] = inlineScripts(INDEX_HTML)
    const src = scriptSrc()
    expect(src).toContain(`'sha256-${sha256(script)}'`)
    expect(src).toContain(`'self'`)
    expect(src).not.toContain('unsafe-inline')
    expect(src).not.toContain('unsafe-eval')
  })

  it('locks down the risky fetches while leaving the app its own resources', () => {
    const csp = policy()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    // The one cross-origin the bundle talks to (API + /health).
    expect(csp).toContain('connect-src')
    expect(csp).toContain('https://api.zolai.space')
    // React sets style attributes (the zero-based bars on /data), which a
    // hash cannot cover — this is the deliberate exception, scripts are not.
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    // No blanket `*`, and no `data:`/`blob:` script or style source.
    expect(csp).not.toMatch(/script-src[^;]*\*/)
    expect(scriptSrc()).not.toContain('data:')
    expect(csp).not.toMatch(/style-src[^;]*data:/)
  })

  it('keeps X-Frame-Options and CSP agreeing on framing', () => {
    const block = CONF.match(BLOCKS.server)?.[0] ?? ''
    expect(block).toContain('add_header X-Frame-Options "DENY" always')
    expect(policy()).toContain("frame-ancestors 'none'")
  })
})
