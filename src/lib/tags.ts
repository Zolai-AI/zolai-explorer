/**
 * Tag-list presentation helpers, kept free of React and the DOM so they can be
 * unit tested in a plain Node environment.
 */

/**
 * Collapse duplicate tags the server sent twice in two spellings.
 *
 * `GET /word/{w}` really does return `pos: ['Noun', 'NOUN']` for the same
 * part of speech (a live-captured payload in `lib/schemas.test.ts`), and two
 * chips for one tag reads as two facts. This keeps the **first spelling seen**
 * and drops later case-insensitive matches, so nothing is invented and no
 * distinct tag is lost.
 *
 * Blank and whitespace-only entries are dropped: they render as an empty chip,
 * which is noise rather than a value. Order is preserved.
 */
export function dedupeTags(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const clean = value.trim()
    if (clean === '') continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }
  return out
}
