import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url))

/** Every `.ts` / `.tsx` file under `src/` — test files included. */
function sourceFiles(dir = SRC_DIR): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path))
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    out.push(path)
  }
  return out
}

/**
 * Provider ids and model ids are **server data**, never app constants: the
 * selectors are fed by `GET /api/v1/providers`, so naming a target in source
 * would silently pin this UI to one deployment's catalog (and rot the moment
 * the catalog changes). That holds for test payloads too — a fixture that
 * quotes a vendor id is a fixture that pins the same catalog, so every
 * `*.test.ts` / `*.test.tsx` file is scanned and fixtures use generic ids
 * (`primary`, `model-a`, …) instead of live ones.
 */
const FORBIDDEN: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'a catalog id (provider name)', pattern: /\bpcore-brain\b/i },
  { label: 'a model namespace', pattern: /\bopencode\//i },
  { label: 'a model namespace', pattern: /\bopenrouter\//i },
  { label: 'a vendor model id', pattern: /\bgpt-[0-9]/i },
  { label: 'a vendor model id', pattern: /\bclaude-[0-9]/i },
  { label: 'a vendor model id', pattern: /\bgemini-[0-9]/i },
  { label: 'a vendor model id', pattern: /\bllama-[0-9]/i },
  { label: 'a vendor model id', pattern: /\bmixtral-[0-9]/i },
  { label: 'a vendor model id', pattern: /\bqwen[0-9]/i },
  { label: 'a vendor model id', pattern: /\bdeepseek-[0-9]/i },
  { label: 'a vendor model id', pattern: /\bmistral-[0-9]/i },
  { label: 'a vendor model id', pattern: /\bphi-[0-9]/i },
  { label: 'a vendor model id', pattern: /\bgemma-[0-9]/i },
  { label: 'a demo model id', pattern: /\bfree-[0-9]\b/ },
]

describe('no hardcoded provider or model ids in src/', () => {
  const files = sourceFiles().map((path) => ({
    path: path.slice(SRC_DIR.length),
    text: readFileSync(path, 'utf8'),
  }))

  it('scans every source file, tests included', () => {
    // Guard the guard: a scanner that found nothing because it walked nothing
    // would make the assertions below vacuously true — and one that skipped
    // `*.test.ts` let vendor fixtures live in the specs while the guard stayed
    // green.
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((file) => file.path.endsWith('.test.ts'))).toBe(true)
    expect(files.some((file) => file.path.endsWith('.test.tsx'))).toBe(true)
  })

  it('never names a provider id or a model id in application code', () => {
    const offenders: string[] = []
    for (const { path, text } of files) {
      for (const { label, pattern } of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${path}: ${label} (${pattern.source})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the selector fed by the API rather than by a constant', () => {
    // The provider list comes from the fetched payload — if that ever moves
    // into a literal, the scan above is the backstop. An empty selection is now
    // a real "no override" state, so there is no seeded default to assert.
    const component = files.find((file) => file.path.endsWith('ProviderModelSelect.tsx'))
    expect(component).toBeDefined()
    expect(component?.text).toContain('useProviderCatalog()')
  })
})
