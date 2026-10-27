/**
 * The static well-known files (issue #2): `/robots.txt` and
 * `/.well-known/security.txt` must exist as real files so no server in the
 * chain — Vite dev, `vite preview`, or the nginx vhost in `deploy/nginx/` —
 * falls through to the SPA fallback and answers with `index.html`.
 *
 * This is a filesystem + deploy-contract test (node, no DOM): it pins the
 * shipped files and the `try_files` ordering the production host relies on.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoFile = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')

describe('public/ — real files, never the SPA shell', () => {
  it('ships a robots.txt that is a robots file, not HTML', () => {
    const robots = repoFile('public/robots.txt')
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Allow: \/$/m)
    // The bug this pins: the path used to answer 200 with the index page.
    expect(robots).not.toMatch(/<html/i)
    expect(robots.length).toBeGreaterThan(0)
  })

  it('ships an RFC 9116 security.txt with a contact and an expiry', () => {
    const security = repoFile('public/.well-known/security.txt')
    expect(security).toMatch(/^Contact: https?:\/\//m)
    expect(security).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m)
    expect(security).not.toMatch(/<html/i)
  })
})

describe('deploy/nginx — real files win over the SPA fallback', () => {
  // The production host serves `dist/` behind this vhost. `$uri` first means
  // the two files above (once rsynced into the doc root) are answered as
  // text/plain, and only unknown paths fall back to index.html.
  it('tries the literal path before the index fallback', () => {
    const conf = repoFile('deploy/nginx/zolai-explorer.conf')
    expect(conf).toMatch(/try_files \$uri \$uri\/ \/index\.html;/)
  })
})
