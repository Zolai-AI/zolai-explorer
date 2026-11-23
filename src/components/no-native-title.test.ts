/**
 * Repo-wide drift guard for candidate #8: a **native** `title=` attribute.
 *
 * Nine loops of per-component fixes kept re-growing the same defect elsewhere —
 * a browser-measured sweep found 21–22 `title=` still on screen per page even
 * after the components named in the issue were cleaned, because nothing failed
 * when a *new* one appeared. A native tooltip is unreachable by keyboard and
 * touch, times out, and is suppressed on touch devices, so any content that only
 * lives there fails WCAG 1.4.13.
 *
 * Capitalized tags are exempt: `<Card title=…>`, `<Notice title=…>`,
 * `<PageHeader title=…>` are component props that render visible text, not
 * attributes handed to the DOM.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../', import.meta.url))

/** Vendored shadcn primitives are never edited here; tests are the guards themselves. */
const SKIP = new Set(['ui', 'test', '__screenshots__'])

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue
      tsxFiles(join(dir, entry.name), out)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) continue
    out.push(join(dir, entry.name))
  }
  return out
}

/** Comments are prose about removed tooltips, not live attributes. */
function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

/**
 * Every `<lowercase-tag … title=…>` opening in the file.
 *
 * The tag grammar is deliberately narrow: an attribute list may not contain a
 * `>` outside a `{…}` expression, and JSX never writes one that does, so the
 * match cannot run past its own element.
 */
function nativeTitleAttributes(text: string): string[] {
  const found: string[] = []
  const tags = /<([a-z][a-z0-9-]*)((?:[^<>]|\{[^{}]*\})*)>/g
  for (const match of text.matchAll(tags)) {
    if (/(?:^|\s)title=/.test(match[2] ?? '')) {
      found.push(`<${match[1]} … ${/\stitle=\{?[^\s>]*"?/.exec(match[2] ?? '')?.[0].trim()}>`)
    }
  }
  return found
}

describe('no native title= anywhere in the studio', () => {
  const files = tsxFiles(SRC)

  it('scans the components it claims to', () => {
    // A guard that silently matched zero files is worse than none: it reports
    // green forever. The shell files that carried the 21 measured tooltips must
    // be in the set.
    const names = files.map((f) => f.slice(SRC.length))
    for (const required of [
      'components/Sidebar.tsx',
      'components/TopBar.tsx',
      'components/AppShell.tsx',
      'components/DataFreshness.tsx',
      'components/HealthPill.tsx',
    ]) {
      expect(names, `${required} not scanned`).toContain(required)
    }
    expect(files.length).toBeGreaterThan(40)
  })

  it('finds zero title attributes handed to a DOM element', () => {
    const offenders: string[] = []
    for (const file of files) {
      const hits = nativeTitleAttributes(stripComments(readText(file)))
      if (hits.length) offenders.push(`${file.slice(SRC.length)}: ${hits.join(', ')}`)
    }
    expect(offenders, 'a native tooltip is invisible to keyboard and touch (WCAG 1.4.13)').toEqual([])
  })

  it('actually fires on the shape it forbids', () => {
    // Positive control: a detector that matches nothing passes by accident.
    // These are the exact shapes the browser sweep found in the shell.
    expect(nativeTitleAttributes('<button title="Expand">x</button>')).toHaveLength(1)
    expect(nativeTitleAttributes('<td\n  title={description}\n>')).toHaveLength(1)
    expect(nativeTitleAttributes('<a title={signIn.title}>Sign in</a>')).toHaveLength(1)
    // …and stay quiet on the component props that render the same words visibly.
    expect(nativeTitleAttributes('<Button title="Expand">x</Button>')).toHaveLength(0)
    expect(nativeTitleAttributes('<Card title="Goal" subtitle={s}>')).toHaveLength(0)
    expect(nativeTitleAttributes('<span aria-label="Expand">x</span>')).toHaveLength(0)
  })
})

function readText(file: string): string {
  return readFileSync(file, 'utf8')
}
