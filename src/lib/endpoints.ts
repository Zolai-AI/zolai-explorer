/**
 * The API surface this studio consumes — **one typed registry**.
 *
 * Why this file exists: the endpoint table used to be hand-typed inside
 * `src/routes/Links.tsx`, so it listed 12 routes while the app actually called
 * more, and the same records were re-implemented as string literals inside every
 * feature transport. Two lists meant two truths.
 *
 * Rules that keep it a single source of truth:
 *   - a transport **never** writes a path literal. It calls `endpointPath(id)`
 *     (plus `queryLimitPath` when the route takes a `limit`), so the registry
 *     owns method, template, scope and limit placement;
 *   - the Links page renders `ENDPOINTS` — no second table to drift;
 *   - the README table is generated from the same records, and
 *     `endpoints.test.ts` fails if a path literal reappears anywhere else, if an
 *     id is never used, or if the README drifts.
 *
 * Endpoint facts (method, scope, where `limit` travels, what is populated) were
 * read off `zolai-core` source; `zolai-core` itself is read-only for this app.
 */

/** HTTP method — mirrors `ApiMethod` in `src/lib/api.ts`. */
export type EndpointMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/** Functional area — the Links page groups rows by this. */
export type EndpointArea =
  | 'identity'
  | 'word'
  | 'analysis'
  | 'retrieval'
  | 'assistant'
  | 'agent'
  | 'knowledge'
  | 'admin'

/**
 * Where the `limit` parameter travels on a route.
 *
 * There is **no** `page_size` anywhere in the API: `limit` is the only name. On
 * GET routes it is a query parameter, on the POST routes it is a JSON body
 * field. Routes that ignore it server-side are marked `'none'` so the UI never
 * claims a page size that does nothing.
 */
export type LimitPlacement = 'none' | 'query' | 'body'

export type EndpointSpec = {
  /** Stable id — what `endpointPath()` takes, and what the drift test matches. */
  id: string
  method: EndpointMethod
  /**
   * Path relative to `API_BASE` (`/api/v1`), with `{name}` marking a path
   * parameter. `/health` is deliberately absent: it lives outside the versioned
   * surface and is fetched with `apiGetAbsolute`.
   */
  template: string
  area: EndpointArea
  /**
   * Minimum scope the server demands (`require_scope`). `''` means the route is
   * public — no key needed, or an absent key is still answered.
   */
  scope: string
  /** Server default for `limit`, or `null` when the route has no such parameter. */
  limitDefault: number | null
  /** Server cap for `limit` (`Query(le=…)`), or `null` when unbounded. */
  limitMax: number | null
  limit: LimitPlacement
  /** Short, honest note rendered on the Links page. */
  note: string
}

/**
 * Every endpoint the studio calls, in the order the Links page renders them.
 *
 * Scope values come straight from the routers: `dataset:read` for the word and
 * knowledge reads, `rag:read` for `/rag` + `/analyze/*`, `dataset:read` for
 * `/search`, `settings:read`/`settings:write` (strict) for the provider catalog,
 * `agent:run`/`agent:read` (strict) for agent runs, admin role + `agent:run`
 * (strict) for the admin assistant, `apikey:manage` (strict) for key admin.
 */
export const ENDPOINTS: readonly EndpointSpec[] = [
  {
    id: 'identity.me',
    method: 'GET',
    template: '/auth/me',
    area: 'identity',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Public identity probe — role, key prefix, scopes and auth mode. Never 401s.',
  },
  {
    id: 'word.entry',
    method: 'GET',
    template: '/word/{word}',
    area: 'word',
    scope: 'dataset:read',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Word entry: frequency, POS, sources, confidence (sentence_frequency always 0).',
  },
  {
    id: 'word.forms',
    method: 'GET',
    template: '/word/{word}/forms',
    area: 'word',
    scope: 'dataset:read',
    limitDefault: 20,
    limitMax: 100,
    limit: 'query',
    note: 'Observed surface forms — usually empty; the morphology table is thin.',
  },
  {
    id: 'word.contexts',
    method: 'GET',
    template: '/word/{word}/contexts',
    area: 'word',
    scope: 'dataset:read',
    limitDefault: 20,
    limitMax: 100,
    limit: 'query',
    note: 'Parallel EN/ZO Bible verses. Bare array — no server total.',
  },
  {
    id: 'word.collocations',
    method: 'GET',
    template: '/word/{word}/collocations',
    area: 'word',
    scope: 'dataset:read',
    limitDefault: 20,
    limitMax: 100,
    limit: 'query',
    note: 'PMI collocation pairs (frequency + PMI).',
  },
  {
    id: 'word.patterns',
    method: 'GET',
    template: '/word/{word}/patterns',
    area: 'word',
    scope: 'dataset:read',
    limitDefault: 20,
    limitMax: 100,
    limit: 'query',
    note: 'Observed grammar patterns referencing the word.',
  },
  {
    id: 'word.evidence',
    method: 'GET',
    template: '/word/{word}/evidence',
    area: 'word',
    scope: 'dataset:read',
    limitDefault: 50,
    limitMax: 200,
    limit: 'query',
    note: 'Tiered provenance records — the one word route capped at 200.',
  },
  {
    id: 'analyze.sentence',
    method: 'POST',
    template: '/analyze/sentence',
    area: 'analysis',
    scope: 'rag:read',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Tokenise one sentence. Only `tokens` is populated today.',
  },
  {
    id: 'analyze.paragraph',
    method: 'POST',
    template: '/analyze/paragraph',
    area: 'analysis',
    scope: 'rag:read',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Segment a paragraph into sentences.',
  },
  {
    id: 'search.query',
    method: 'POST',
    template: '/search',
    area: 'retrieval',
    scope: 'dataset:read',
    limitDefault: 20,
    limitMax: 100,
    limit: 'body',
    note: 'Lexical corpus search; `limit` travels in the JSON body (default 20).',
  },
  {
    id: 'rag.ask',
    method: 'POST',
    template: '/rag',
    area: 'retrieval',
    scope: 'rag:read',
    limitDefault: 5,
    limitMax: 100,
    limit: 'body',
    note: 'Retrieval + citations are real; `answer` is a placeholder template echo. The server hardcodes 10 snippets, so the label stays honest about what it asked for.',
  },
  {
    id: 'assistant.chat.public',
    method: 'POST',
    template: '/assistant/chat',
    area: 'assistant',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Public chat — stays open under enforce; `retrieval_only` when no model ran.',
  },
  {
    id: 'assistant.chat.admin',
    method: 'POST',
    template: '/admin/assistant/chat',
    area: 'assistant',
    scope: 'agent:run',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Admin chat — strict admin role + agent:run, full tool set and trace.',
  },
  {
    id: 'agent.run.create',
    method: 'POST',
    template: '/agent/runs',
    area: 'agent',
    scope: 'agent:run',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Start a research run. Runs synchronously (≤60s), 5 runs/min/key.',
  },
  {
    id: 'agent.run.read',
    method: 'GET',
    template: '/agent/runs/{run_id}',
    area: 'agent',
    scope: 'agent:read',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Poll one run; phases render exactly what the server recorded.',
  },
  {
    id: 'agent.run.feedback',
    method: 'POST',
    template: '/agent/runs/{run_id}/feedback',
    area: 'agent',
    scope: 'agent:run',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Thumbs −1|1; score ≥ 1 queues hypothesis candidates (never a canonical write).',
  },
  {
    id: 'knowledge.statistics',
    method: 'GET',
    template: '/knowledge/statistics',
    area: 'knowledge',
    scope: 'dataset:read',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Collection row counts as human labels, e.g. "dictionary entries".',
  },
  {
    id: 'knowledge.version',
    method: 'GET',
    template: '/knowledge/version',
    area: 'knowledge',
    scope: 'dataset:read',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Knowledge build version, git commit and build time.',
  },
  {
    id: 'foundation.stats',
    method: 'GET',
    template: '/foundation/stats',
    area: 'knowledge',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Optional surface: curation counters. Absent on deployments without the router.',
  },
  {
    id: 'admin.providers.list',
    method: 'GET',
    template: '/admin/ai-providers',
    area: 'admin',
    scope: 'settings:read',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Provider catalog. Secrets come back masked (`ref_masked`).',
  },
  {
    id: 'admin.providers.update',
    method: 'PUT',
    template: '/admin/ai-providers/{catalog_id}',
    area: 'admin',
    scope: 'settings:write',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Rename, model, enable, tier, timeout, or a write-only `secret`.',
  },
  {
    id: 'admin.providers.activate',
    method: 'POST',
    template: '/admin/ai-providers/{catalog_id}/activate',
    area: 'admin',
    scope: 'settings:write',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Make one row the active provider.',
  },
  {
    id: 'admin.apikeys.list',
    method: 'GET',
    template: '/admin/api-keys',
    area: 'admin',
    scope: 'apikey:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Key metadata only — prefixes, scopes, expiry. Hashes, never plaintext.',
  },
  {
    id: 'admin.apikeys.create',
    method: 'POST',
    template: '/admin/api-keys',
    area: 'admin',
    scope: 'apikey:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Issue a key. The plaintext secret is returned **once** and never again.',
  },
  {
    id: 'admin.apikeys.rotate',
    method: 'POST',
    template: '/admin/api-keys/{key_id}/rotate',
    area: 'admin',
    scope: 'apikey:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Issue a replacement and revoke the old one; plaintext shown once.',
  },
  {
    id: 'admin.apikeys.revoke',
    method: 'POST',
    template: '/admin/api-keys/{key_id}/revoke',
    area: 'admin',
    scope: 'apikey:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Revoke a key — it is rejected from the very next request.',
  },
  {
    id: 'admin.providers.test',
    method: 'POST',
    template: '/admin/ai-providers/{catalog_id}/test',
    area: 'admin',
    scope: 'settings:write',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'One-token connection probe; returns latency and the model that answered.',
  },
] as const

/** Derived id union — `endpointPath()` only accepts a real id. */
export type EndpointId = (typeof ENDPOINTS)[number]['id']

export const ENDPOINTS_BY_ID: Record<EndpointId, EndpointSpec> = ENDPOINTS.reduce(
  (byId, spec) => {
    byId[spec.id as EndpointId] = spec
    return byId
  },
  {} as Record<EndpointId, EndpointSpec>,
)

/** Human group label for an area, in render order. */
export const AREA_LABELS: Record<EndpointArea, string> = {
  identity: 'Identity',
  word: 'Word explorer',
  analysis: 'Analysis',
  retrieval: 'Retrieval',
  assistant: 'Assistant',
  agent: 'Agent',
  knowledge: 'Knowledge',
  admin: 'Admin (role-gated)',
}

/** The public path as the Links page and the README print it. */
export function publicPath(spec: EndpointSpec): string {
  return `/api/v1${spec.template}`
}

/** The method badge text, used for the colour decision in Links. */
export function isWriteMethod(spec: EndpointSpec): boolean {
  return spec.method !== 'GET'
}

/**
 * Build a request path from a registry record. `{name}` placeholders are
 * URL-encoded, so a headword containing `/` or `?` cannot escape its segment.
 *
 * Throws on a missing parameter: a half-built path is a programming error, and a
 * silent `{}` in a URL would 404 against the API in a way that looks like a bug.
 */
export function endpointPath(
  id: EndpointId,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const spec = ENDPOINTS_BY_ID[id]
  if (!spec) throw new Error(`Unknown endpoint id '${String(id)}'`)
  return spec.template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name]
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`endpointPath('${id}') is missing the '${name}' path parameter`)
    }
    return encodeURIComponent(String(value).trim())
  })
}

/**
 * Append the `limit` query parameter to a GET path.
 *
 * Only valid for endpoints whose `limit` is `'query'`; the caller clamps to
 * `limitMax` first (the server answers 422 outside its bounds).
 */
export function queryLimitPath(
  id: EndpointId,
  params: Readonly<Record<string, string | number>>,
  limit: number,
): string {
  const spec = ENDPOINTS_BY_ID[id]
  if (!spec) throw new Error(`Unknown endpoint id '${String(id)}'`)
  if (spec.limit !== 'query') {
    throw new Error(`endpoint '${id}' takes no query limit (placement: ${spec.limit})`)
  }
  const clamped = clampLimit(id, limit)
  const base = endpointPath(id, params)
  return `${base}?limit=${clamped}`
}

/**
 * Clamp a requested `limit` into the route's documented bounds
 * (`1 … limitMax`). Never returns 0 or a fractional value — the API answers 422.
 */
export function clampLimit(id: EndpointId, limit: number): number {
  const spec = ENDPOINTS_BY_ID[id]
  const max = spec?.limitMax ?? 100
  const value = Math.trunc(Number(limit))
  if (!Number.isFinite(value)) return Math.min(spec?.limitDefault ?? 20, max)
  return Math.min(Math.max(value, 1), max)
}

/**
 * Known API gaps, stated plainly so an empty panel is never read as a bug in
 * this app. Each item was verified against the deployed server; the same list is
 * rendered on `/links` and documented in the README honesty contract.
 */
export type ApiGap = { readonly id: string; readonly title: string; readonly body: string }

export const API_GAPS: readonly ApiGap[] = [
  {
    id: 'rag-placeholder-answer',
    title: '/rag answers are placeholder echoes',
    body: 'Retrieval is real — context and citations come from the corpus — but the answer string is a template, because the server holds a placeholder GEMINI_API_KEY and calls no model.',
  },
  {
    id: 'analyze-empty-sections',
    title: '/analyze/sentence returns empty pos, grammar and entities',
    body: 'Only tokens are populated today. The Analyze panel labels the missing sections instead of showing empty boxes.',
  },
  {
    id: 'sentence-frequency-zero',
    title: 'sentence_frequency is always 0',
    body: 'The word explorer shows "—" for sentence counts rather than a misleading zero.',
  },
  {
    id: 'morphology-not-populated',
    title: 'morphology and forms are usually empty',
    body: 'Most entries have no morphology rows; those sections collapse to a "not populated" note rather than a broken panel.',
  },
  {
    id: 'review-stats-missing',
    title: '/review/stats is not available on the versioned API',
    body: '/api/v1/review/stats answers 200 {"error":"Not found"}, and the unversioned /review/stats 422s because /review/{item_id} swallows "stats". No review count is rendered anywhere in this app as if it were real; only the server-rendered /review/ page is linked.',
  },
  {
    id: 'auth-warn-mode',
    title: 'Authentication is in warn mode',
    body: 'The API currently accepts unauthenticated requests and may flip to enforce mode. Add a key now so nothing breaks when it does.',
  },
] as const