/**
 * Copy honesty on the word page (issue #37), and the width-clipped translation
 * variant (candidate #9).
 *
 * A panel may only claim what the field it reads can support, and a control may
 * only advertise an action the page can take. Four sentences broke that rule:
 *
 *   - the Grammar card's empty state asserted a **corpus-wide** fact ("no
 *     grammar-pattern rows reference this word yet") off one entry field
 *     (`grammar_usage` on `GET /word/{w}`), while the Patterns tab on the same
 *     screen lists rows from a *different* endpoint;
 *   - the Sentences tile said "not reported yet", i.e. that the server had never
 *     produced a sentence count anywhere — a zero on one endpoint cannot prove
 *     that;
 *   - the Frequency tile's bare "token count" implied a canonical number while
 *     the Evidence cell cut metadata at four keys **silently**, so a dictionary
 *     count and a corpus count could disagree with nothing on screen to explain
 *     it;
 *   - the Morphology card stated a general fact about the **deployed server**
 *     ("empty on the live API", "The live endpoint returns {} for morphology")
 *     off one field on one response, which can only ever observe that *this*
 *     entry carried no morphology.
 *
 * The Node test environment has no DOM, so the sentences are guarded as source
 * (the forbidden phrasing must not reappear, and the cell must stay a plain text
 * marker rather than an invented affordance), while the truncation arithmetic is
 * guarded directly as a pure function — the same split `Review.test.tsx` uses for
 * `previewCell`.
 *
 * The second half guards candidate #9: the parallel-contexts card dropped the
 * **ZO Tedim 2010** variant below `lg` behind a bespoke `hideBelow`, with nothing
 * on screen saying so — the row read as EN + ZO TDB77 only, and because the card
 * is not a `DataTable` column, the footer marker (`hiddenColumnsAt`) could not
 * announce it. `ContextsPanel` is plain props, so it renders through
 * `react-dom/server` and the markup itself is the guard.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WordContext } from '../lib/schemas'
import { ContextsPanel, GrammarUsageList, metadataPreview } from './Word'

const SOURCE = readFileSync(fileURLToPath(new URL('./Word.tsx', import.meta.url)), 'utf8')

/** Six keys, so the four-key cell has to leave something out. */
const SIX_KEYS: Record<string, unknown> = {
  book: 'John',
  chapter: 3,
  verse: 16,
  variant: 'TDB77',
  tier: 2,
  score: 0.82,
}

describe('metadataPreview', () => {
  it('leaves a dictionary the cell can show whole unmarked', () => {
    expect(metadataPreview({ book: 'John', chapter: 3 })).toBe('book=John chapter=3')
  })

  it('adds no marker at exactly the limit — nothing was hidden', () => {
    const four = { book: 'John', chapter: 3, verse: 16, variant: 'TDB77' }
    expect(Object.keys(four)).toHaveLength(4)
    expect(metadataPreview(four)).toBe('book=John chapter=3 verse=16 variant=TDB77')
    expect(metadataPreview(four)).not.toContain('more')
  })

  it('counts the two keys it did not render', () => {
    expect(metadataPreview(SIX_KEYS)).toBe(
      'book=John chapter=3 verse=16 variant=TDB77 +2 more',
    )
  })

  it('derives the marker from the real count, not from the limit', () => {
    // Six keys with room for two → four hidden; five keys with room for two →
    // three hidden. A hard-coded "+2" would fail both.
    expect(metadataPreview(SIX_KEYS, 2)).toBe('book=John chapter=3 +4 more')
    expect(metadataPreview({ a: 1, b: 2, c: 3, d: 4, e: 5 }, 2)).toBe('a=1 b=2 +3 more')
  })

  it('keeps the em-dash for an empty dictionary, unadorned', () => {
    expect(metadataPreview({})).toBe('—')
  })

  it('still abbreviates a nested value, so the marker is the only new claim', () => {
    expect(metadataPreview({ align: { left: 4, right: 9 }, tier: 2 }, 1)).toBe(
      'align=… +1 more',
    )
    expect(metadataPreview({ a: null, b: 1 })).toBe('a=— b=1')
  })
})

describe('the word page copy stays inside what its field supports', () => {
  it('never reasserts a corpus-wide fact from the grammar_usage field', () => {
    expect(SOURCE).not.toContain('No grammar-pattern rows reference this word yet')
    expect(SOURCE).not.toContain('See the Patterns tab')
    expect(SOURCE).not.toContain('pattern hits for this word')
    // The replacement claims only this response, and names the endpoint the rule
    // requires — without spelling the server's field name into the prose.
    expect(SOURCE).toContain('returns no grammar usage for this entry')
    expect(SOURCE).toContain('the Patterns tab reads its own endpoint')
  })

  it('never claims the server produced no sentence count anywhere', () => {
    expect(SOURCE).not.toContain('not reported yet')
    expect(SOURCE).toContain('reports 0 for this entry')
  })

  it('says which number the frequency tile is', () => {
    expect(SOURCE).not.toContain('hint="token count"')
    expect(SOURCE).toContain('from the dictionary entry on GET /word/${data.word}')
  })

  it('never asserts a server-wide morphology gap this panel did not measure', () => {
    // The Morphology card reads one field on one response. "empty on the live
    // API" and "The live endpoint returns {} for morphology" were claims about
    // the deployed server; all this card can know is that *this* entry carried
    // no morphology.
    expect(SOURCE).not.toContain('empty on the live API')
    expect(SOURCE).not.toContain('The live endpoint returns {} for morphology')
    expect(SOURCE).not.toContain('Surface forms live in the Forms tab')
    // The replacement stays inside the observation, names the endpoint the rule
    // requires, and points at the Forms tab by what that tab does — without
    // promising that it holds rows.
    expect(SOURCE).toContain('empty in this response')
    expect(SOURCE).toContain(
      'GET /word/${data.word} returns no morphology for this entry — the Forms tab reads its own endpoint for surface forms.',
    )
    // `morphology` goes through the tolerant `record` schema (`.catch({})`), so
    // an absent key and a present-but-`{}` one are indistinguishable here — the
    // copy may not imply either, only that the entry carries no morphology.
    expect(SOURCE).not.toContain('has no morphology field')
    expect(SOURCE).not.toContain('does not include morphology')
  })

  it('marks the dropped metadata keys as plain text, never as a control it does not have', () => {
    // The cell renders the preview string and nothing else — no tooltip, no
    // expander, no "show all" the page cannot honour.
    expect(SOURCE).toMatch(
      /cell: \(row\) => \(\s*<span className="text-muted-foreground">\{metadataPreview\(row\.metadata\)\}<\/span>\s*\),/,
    )
    expect(SOURCE).not.toContain('Show all')
    expect(SOURCE).toMatch(/\+\$\{hidden\} more/)
  })
})

/** A verbatim `/word/{w}/contexts` row — the same capture `schemas.test.ts` uses. */
const CONTEXT_ROW: WordContext = {
  source: 'bible_verses',
  ref: '1CH 4:10',
  en: 'And Jabez called on the God of Israel',
  zo_tdb77: 'Jabez in Israel Pasian tungah thu ngen a',
  zo_tedim2010: 'Jabez in Israel Pasian tungah thu ngen a',
}

/**
 * The `function Paragraph({` component: from its signature up to the next
 * top-level `function` declaration, so the props type and the body are both
 * inside the slice (the column specs in the panels below legitimately carry
 * their own `hideBelow`, and they must stay out of this guard).
 */
function paragraphBlock(source: string): string {
  const start = source.indexOf('function Paragraph({')
  if (start === -1) throw new Error('Paragraph component not found in Word.tsx')
  const end = source.indexOf('\nfunction ', start)
  if (end === -1) throw new Error('no declaration follows Paragraph in Word.tsx')
  return source.slice(start, end)
}

function renderContexts(rows: WordContext[]): string {
  return renderToStaticMarkup(<ContextsPanel word="pasian" rows={rows} limit={20} />)
}

describe('the parallel-contexts card shows every variant the payload carries', () => {  it('renders all three translation variants into the markup', () => {
    const html = renderContexts([CONTEXT_ROW])
    expect(html).toContain('EN (KJV)')
    expect(html).toContain('ZO TDB77')
    expect(html).toContain('ZO Tedim 2010')
    expect(html).toContain(CONTEXT_ROW.en)
    expect(html).toContain(CONTEXT_ROW.zo_tedim2010)
  })

  it('hides nothing behind a responsive class — the grid just stacks', () => {
    // No `hidden sm|md|lg|xl:block` may reach the card: below `lg` the grid is
    // already one column, so the only thing a hide could buy is an unannounced
    // missing variant.
    const html = renderContexts([CONTEXT_ROW])
    expect(html).not.toMatch(/hidden (?:sm|md|lg|xl):block/)
    expect(SOURCE).not.toMatch(/hidden (?:sm|md|lg|xl):block/)
    // Mobile-first: the base layout is the stacked one, `lg` only widens it.
    expect(SOURCE).toContain('className="grid gap-2 lg:grid-cols-3"')
  })

  it('leaves no bespoke hideBelow on the card cells, so no cliff goes unmarked', () => {
    // `Paragraph` was the file's only bespoke hider and the DataTable footer
    // marker cannot reach it. Dropping the prop entirely means TypeScript
    // rejects the next attempt, and the guard says so in the failing spec.
    const tags = SOURCE.match(/<Paragraph\b[^>]*\/>/g) ?? []
    expect(tags).toHaveLength(3)
    for (const tag of tags) expect(tag).not.toContain('hideBelow')
    expect(paragraphBlock(SOURCE)).not.toContain('hideBelow')
    // And since nothing is hidden here any more, the marker's own vocabulary
    // would be a lie if it ever migrated into this panel.
    expect(SOURCE).not.toContain('hidden at this width')
  })

  it('says the variant is empty in its own cell instead of dropping it', () => {
    // The tolerant `str` schema collapses an absent key and an empty one to ''
    // (`{ ref: 'GEN 1:1' }` parses with `zo_tedim2010 === ''`), so the cell keeps
    // its label and marks the value — the same treatment the always-visible EN
    // and TDB77 cells get, and never a variant that simply vanishes.
    const html = renderContexts([{ ...CONTEXT_ROW, zo_tedim2010: '' }])
    expect(html).toContain('ZO Tedim 2010')
    expect(html.match(/not stored/g)).toHaveLength(1)
    expect(html).toContain(CONTEXT_ROW.en)
    expect(html).toContain(CONTEXT_ROW.zo_tdb77)
  })
})

/**
 * `grammar_usage` holds learned-pattern records, not opaque strings. The card
 * used to `JSON.stringify` each one: **unreadable**, and the resulting
 * ~400px run of text set the summary grid's min-content, so on a 390px phone
 * the whole page scrolled sideways (caught by `ui-check`: 124 defects, all on
 * `/word/pasian`). These guards pin both halves — the fields are read, and the
 * text can wrap without a break opportunity.
 */
const GRAMMAR_ROW: Record<string, unknown> = {
  pattern_id: 'disc_p_bible_pasian_aw',
  pattern: 'pasian aw',
  description: 'Learned paragraph opener from Bible (TDB77): 27 paragraphs, lift 11.57x',
  function: 'paragraph_opener',
  examples: [{ zolai: 'Pasian aw, …', ref: 'DAN 9:17', source: 'bible' }],
  confidence: 1.0,
  status: 'OBSERVED',
}

function renderGrammar(rows: Record<string, unknown>[]): string {
  return renderToStaticMarkup(<GrammarUsageList rows={rows} />)
}

describe('the grammar-usage card reads the record instead of stringifying it', () => {
  it('renders the pattern, function, status, confidence and example refs', () => {
    const html = renderGrammar([GRAMMAR_ROW])
    expect(html).toContain('pasian aw')
    expect(html).toContain('paragraph opener')
    expect(html).toContain('OBSERVED')
    expect(html).toContain('confidence 100%')
    expect(html).toContain('27 paragraphs')
    expect(html).toContain('DAN 9:17')
    // The raw record must not leak through as JSON.
    expect(html).not.toContain('pattern_id')
    expect(html).not.toContain('{&quot;')
    expect(html).not.toContain('{"')
  })

  it('lets a run without spaces wrap, which is what keeps the page 390px wide', () => {
    // `overflow-wrap: anywhere` also shrinks the min-content size — `break-words`
    // alone does not, which is why the grid still stretched.
    expect(renderGrammar([GRAMMAR_ROW])).toContain('overflow-wrap:anywhere')
    expect(SOURCE).toContain('flex min-w-0 flex-col gap-4')
  })

  it('still shows a record outside the expected shape, as wrapped text', () => {
    const html = renderGrammar([{ unknown: { nested: true } }])
    expect(html).toContain('unknown')
    expect(html).toContain('nested')
    expect(html).toContain('overflow-wrap:anywhere')
  })

  it('shortens a wiki path to its file and counts the refs it does not show', () => {
    const html = renderGrammar([
      {
        pattern: 'topa pasian',
        examples: [
          { ref: 'zolai-wiki/grammar/song_analysis_batch14.md#p10.1' },
          { ref: 'zolai-wiki/grammar/song_analysis_batch20.md#p28.1' },
          { ref: 'zolai-wiki/grammar/song_analysis_batch21.md#p37.1' },
        ],
      },
    ])
    expect(html).toContain('…/song_analysis_batch14.md#p10.1')
    expect(html).not.toContain('zolai-wiki/grammar/song_analysis_batch14')
    // Three refs, two shown — the third is counted rather than silently gone.
    expect(html).toContain('+1 more')
  })
})
