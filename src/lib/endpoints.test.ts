import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  API_GAPS,
  AREA_LABELS,
  ENDPOINTS,
  ENDPOINTS_BY_ID,
  clampLimit,
  endpointPath,
  publicPath,
  queryLimitPath,
} from './endpoints'

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url))
const REGISTRY_FILE = 'endpoints.ts'

/** Every `.ts` / `.tsx` source file, registry and tests excluded. */
function sourceFiles(dir = SRC_DIR): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path))
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    if (entry.name.endsWith('.test.ts')) continue
    if (entry.name === REGISTRY_FILE) continue
    out.push(path)
  }
  return out
}

const SOURCES = sourceFiles().map((path) => ({
  path: path.slice(SRC_DIR.length),
  text: readFileSync(path, 'utf8'),
}))

/** `apiGet('/word/x')` — a hard-coded route string in a transport. */
const LITERAL_CALL = /\bapi(?:Get|Post|Put|Fetch|GetAbsolute)(?:<[^>]*>)?\(\s*(['"`])([^'"`]+)\1/g

/**
 * `endpointPath('word.entry')` — the sanctioned way to build a path. The whole
 * argument list is captured so a ternary of two ids still counts as "used".
 */
const REGISTRY_CALL = /\b(?:endpointPath|queryLimitPath)\(([^)]*)\)/g
const QUOTED_ID = /'([\w.]+)'/g

describe('endpoint registry', () => {
  it('has a unique id per record and no duplicate method + template pair', () => {
    const ids = ENDPOINTS.map((spec) => spec.id)
    expect(ids.length).toBe(new Set(ids).size)
    const routes = ENDPOINTS.map((spec) => `${spec.method} ${spec.template}`)
    expect(routes.length).toBe(new Set(routes).size)
  })

  it('declares a template, a note and a known area for every record', () => {
    for (const spec of ENDPOINTS) {
      expect(spec.template.startsWith('/'), spec.id).toBe(true)
      expect(spec.note.length, spec.id).toBeGreaterThan(10)
      expect(Object.keys(AREA_LABELS), spec.id).toContain(spec.area)
    }
  })

  it('keeps only balanced {param} placeholders in templates', () => {
    for (const spec of ENDPOINTS) {
      const opens = (spec.template.match(/\{/g) ?? []).length
      const closes = (spec.template.match(/\}/g) ?? []).length
      expect(opens, spec.id).toBe(closes)
      expect(spec.template).not.toMatch(/\{\s|\s\}/)
      // A limit travels as a query parameter or a body field, never a path segment.
      expect(spec.template, spec.id).not.toContain('{limit}')
    }
  })

  it('pairs a limit placement with a default and a cap, or with neither', () => {
    for (const spec of ENDPOINTS) {
      if (spec.limit === 'none') {
        expect(spec.limitDefault, spec.id).toBeNull()
        expect(spec.limitMax, spec.id).toBeNull()
        continue
      }
      expect(spec.limitDefault, spec.id).not.toBeNull()
      expect(spec.limitMax, spec.id).not.toBeNull()
      expect(spec.limitDefault as number, spec.id).toBeLessThanOrEqual(spec.limitMax as number)
      expect(spec.limitDefault as number, spec.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('indexes every record by its id', () => {
    for (const spec of ENDPOINTS) expect(ENDPOINTS_BY_ID[spec.id as never]).toBe(spec)
  })
})

describe('endpointPath', () => {
  it('builds a parameterless path verbatim', () => {
    expect(endpointPath('knowledge.statistics')).toBe('/knowledge/statistics')
    expect(endpointPath('rag.ask')).toBe('/rag')
  })

  it('fills and URL-encodes path parameters', () => {
    expect(endpointPath('word.entry', { word: 'pasian' })).toBe('/word/pasian')
    // A headword with a slash or question mark cannot escape its segment.
    expect(endpointPath('word.entry', { word: 'a/b?c' })).toBe('/word/a%2Fb%3Fc')
    expect(endpointPath('agent.run.read', { run_id: 42 })).toBe('/agent/runs/42')
  })

  it('throws instead of building a half-path when a parameter is missing', () => {
    expect(() => endpointPath('word.entry')).toThrow(/word/)
    expect(() => endpointPath('word.contexts', { word: '   ' })).toThrow(/word/)
    expect(() => endpointPath('agent.run.feedback', {})).toThrow(/run_id/)
  })

  it('rejects an unknown id instead of requesting a wrong route', () => {
    expect(() => endpointPath('word.nope' as never)).toThrow(/Unknown endpoint id/)
  })
})

describe('limit handling', () => {
  it('appends limit to a query-limited GET route', () => {
    expect(queryLimitPath('word.contexts', { word: 'pasian' }, 25)).toBe(
      '/word/pasian/contexts?limit=25',
    )
  })

  it('clamps to the documented bounds of each route', () => {
    expect(clampLimit('word.contexts', 0)).toBe(1)
    expect(clampLimit('word.contexts', 5000)).toBe(100)
    expect(clampLimit('word.evidence', 5000)).toBe(200)
    expect(clampLimit('word.evidence', 12.9)).toBe(12)
    expect(clampLimit('word.contexts', Number.NaN)).toBe(20)
    // /search and /rag carry the limit in the body, so they have no query cap.
    expect(clampLimit('rag.ask', 5000)).toBe(100)
  })

  it('refuses to put a limit on a route that takes none in the query string', () => {
    expect(() => queryLimitPath('rag.ask', {}, 10)).toThrow(/query limit/)
    expect(() => queryLimitPath('word.entry', { word: 'x' }, 10)).toThrow(/query limit/)
  })

  it('clamps inside queryLimitPath too', () => {
    expect(queryLimitPath('word.evidence', { word: 'pasian' }, 900)).toBe(
      '/word/pasian/evidence?limit=200',
    )
  })
})

describe('publicPath', () => {
  it('renders the documented /api/v1 path', () => {
    expect(publicPath(ENDPOINTS_BY_ID['identity.me'])).toBe('/api/v1/auth/me')
    expect(publicPath(ENDPOINTS_BY_ID['word.contexts'])).toBe('/api/v1/word/{word}/contexts')
  })
})

describe('single source of truth — drift guards', () => {
  it('no transport calls an api helper with a hard-coded path literal', () => {
    const offenders: string[] = []
    for (const { path, text } of SOURCES) {
      for (const match of text.matchAll(LITERAL_CALL)) {
        offenders.push(`${path}: ${match[2]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('every registry record is actually used by a transport', () => {
    const used = new Set<string>()
    for (const { text } of SOURCES) {
      for (const call of text.matchAll(REGISTRY_CALL)) {
        for (const id of call[1].matchAll(QUOTED_ID)) used.add(id[1])
      }
    }
    const missing = ENDPOINTS.map((spec) => spec.id).filter((id) => !used.has(id))
    expect(missing).toEqual([])
  })
})

describe('README sync', () => {
  const readme = readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8')

  it('documents every endpoint the app calls', () => {
    const missing = ENDPOINTS.filter((spec) => !readme.includes(publicPath(spec))).map(
      (spec) => spec.id,
    )
    expect(missing).toEqual([])
  })

  it('keeps the honesty contract aligned with the rendered gap list', () => {
    for (const gap of API_GAPS) {
      // Each gap is either named in the README contract or described by its
      // own headline wording — at minimum the review/stats rule must be stated.
      expect(gap.title.length, gap.id).toBeGreaterThan(10)
      expect(gap.body.length, gap.id).toBeGreaterThan(40)
    }
    expect(readme).toContain('not available')
  })
})