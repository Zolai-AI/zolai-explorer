/**
 * The key dialog's sign-in semantics (loop 6).
 *
 * The dialog used to write `setApiKey` itself. Two entry points then had two
 * meanings: `/login` verified a paste against `GET /auth/me` before storing it,
 * while the dialog stored anything non-empty — and because `credentials.ts`
 * resolves *session wins, else key*, a tab signed in with an account could
 * "save" a key that was never sent. The fix is one path: `signIn`.
 *
 * The Node test environment has no DOM, so this is a source guard — the same
 * split `TopBar.test.tsx` and `Login`-adjacent guards already use.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(fileURLToPath(new URL('./KeyDialog.tsx', import.meta.url)), 'utf8')

describe('KeyDialog — one sign-in path, one meaning of "saved"', () => {
  it('stores through signIn rather than touching localStorage itself', () => {
    expect(SOURCE).toContain('await signIn(result.value)')
    expect(SOURCE).not.toMatch(/\bsetApiKey\(/)
  })

  it('reports the server’s verdict, and only toasts success when it accepted', () => {
    expect(SOURCE).toMatch(
      /if \(!signedIn\.ok\) \{\s*form\.setError\('apiKey', \{ message: signedIn\.message \}\)/,
    )
    // The failure branch returns; the toast is reachable only on `ok: true`.
    expect(SOURCE).toMatch(/return\s*\}\s*toast\.success\('Key verified and stored/)
  })

  it('says what saving actually does', () => {
    expect(SOURCE).toContain('GET /auth/me')
    expect(SOURCE).toContain('ends any password session')
  })
})
