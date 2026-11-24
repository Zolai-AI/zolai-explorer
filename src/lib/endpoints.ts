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
export type EndpointMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Functional area — the Links page groups rows by this. */
export type EndpointArea =
  | 'identity'
  | 'word'
  | 'analysis'
  | 'retrieval'
  | 'assistant'
  | 'agent'
  | 'learning'
  | 'knowledge'
  | 'admin'
  | 'roles'

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
  /**
   * The largest `limit` the client will send, or `null` when the route takes no
   * `limit`.
   *
   * On the GET routes this **is** the server cap (`Query(le=…)`) — a larger value
   * would 422, so the client clamps to it. On the body-limit routes (`/search`
   * and `/rag`) there is **no server bound**: `SearchRequest.limit` and
   * `RAGRequest.limit` are plain pydantic fields
   * (`zolai-core/zolai/api/rag_router.py`), so this number is a deliberate
   * *client* clamp that stops the UI asking for a page it cannot render.
   */
  limitMax: number | null
  limit: LimitPlacement
  /**
   * Query parameters the server **requires**. The server answers 422 without
   * them, so `queryLimitPath` refuses to build a path that omits one.
   *
   * `/records` is the reason this exists: its template carries no `{table}`
   * placeholder, so `endpointPath` had nothing to substitute and the required
   * `table` was silently dropped — the review page asked for `/records?limit=50`
   * and got a 422 instead of rows.
   */
  requiredQuery?: readonly string[]
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
    id: 'identity.capabilities',
    method: 'GET',
    template: '/auth/capabilities',
    area: 'identity',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Public additive capability contract — server-authoritative role/capabilities/feature flags. Never 401s; no secrets.',
  },
  {
    id: 'identity.login',
    method: 'POST',
    template: '/auth/login',
    area: 'identity',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Username/password login — returns a session token. Public, never 401s on valid creds; 401 on bad creds, 429 on rate limit.',
  },
  {
    id: 'identity.logout',
    method: 'POST',
    template: '/auth/logout',
    area: 'identity',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Session logout — best-effort server invalidate. Requires session (Bearer token).',
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
    note:
      'Word entry: frequency, POS, sources, confidence. `frequency` is the **best-supported count** ' +
      'across the entry’s sources, not a sum of them, and `sentence_frequency` / `grammar_usage` are ' +
      'filled from the same rows the /word/{w}/patterns and observation evidence report (a `0` means ' +
      'nothing was recorded for that word, not that the field is unimplemented).',
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
    note:
      'Observed surface forms, populated (e.g. /word/pasian/forms returns 9 and ' +
      '/word/thei/forms returns 20 at limit=20). The `forms` field on the /word/{w} entry is a ' +
      '*different*, usually-empty array — do not conflate the two.',
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
    id: 'word.related',
    method: 'GET',
    template: '/word/{word}/related',
    area: 'word',
    scope: 'dataset:read',
    limitDefault: 12,
    limitMax: 50,
    limit: 'query',
    note:
      'Related words after the exact match: same family (shared prefix / extension) first, ' +
      'then same-POS neighbours. Never includes the query word. Server cap 50 (default 12).',
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
    note:
      'Retrieval + citations are real, and `answer` is written by the provider resolved for ' +
      'the request (the same path the assistant uses), or returned as evidence with ' +
      '`retrieval_only: true`. `limit` is accepted but **ignored** — the response always ' +
      'carries 10 snippets — so the limit here is a client-side clamp, not a server bound.',
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
    id: 'assistant.feedback',
    method: 'POST',
    template: '/assistant/feedback',
    area: 'assistant',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Public feedback on assistant chat response (thumbs −1|1).',
  },
  {
    id: 'contributions.create',
    method: 'POST',
    template: '/contributions',
    area: 'assistant',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Submit a public dictionary contribution for editorial review. Open to anonymous; a resolved credential is recorded as `attributed_to`, and the client never sends an identity field.',
  },
  {
    id: 'contributions.mine',
    method: 'GET',
    template: '/contributions/mine',
    area: 'assistant',
    scope: '',
    limitDefault: 20,
    limitMax: 100,
    limit: 'query',
    note: "This account's own submissions and their review state, newest first. Strict member role and a **session**; the `user_id` comes from the credential, so there is no parameter to point at someone else, and the projection has no `email`.",
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
    note: 'Start a research run. Runs synchronously (≤60s), 5 runs/min/credential.',
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
    id: 'learning.overview',
    method: 'GET',
    template: '/learning/overview',
    area: 'learning',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Registry summary: agent totals, enabled/disabled split, skill count and the role histogram.',
  },
  {
    id: 'learning.agents.list',
    method: 'GET',
    template: '/learning/agents',
    area: 'learning',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Every agent with its skills, enabled flag and tuning (`config`). Public; no key needed.',
  },
  {
    id: 'learning.skills.list',
    method: 'GET',
    template: '/learning/skills',
    area: 'learning',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Skill catalog (id, name, description, category, enabled). Public.',
  },
  {
    id: 'learning.assistants.list',
    method: 'GET',
    template: '/learning/assistants',
    area: 'learning',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Assistant surfaces that have agents bound. Public; currently returns an empty list until something is bound.',
  },
  {
    id: 'learning.bindings.list',
    method: 'GET',
    template: '/learning/bindings',
    area: 'learning',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Agent ↔ assistant bindings; optional `?assistant=<id>` filter. Public; empty until a bind exists.',
  },
  {
    id: 'learning.run',
    method: 'POST',
    template: '/learning/run',
    area: 'learning',
    scope: '',
    limitDefault: 10,
    limitMax: 5000,
    limit: 'body',
    note:
      'Run one orchestrator task (translate, validate/correct grammar, learn Bible patterns, build vocabulary, ' +
      'extract collocations). Public. `limit` travels in the body and the server **clamps anonymous callers to 50**, ' +
      'reporting `limit_applied` and `limit_clamped` — so 5000 here is the pydantic bound, not a client promise.',
  },
  {
    id: 'learning.agents.update',
    method: 'PATCH',
    template: '/learning/agents/{agent_id}',
    area: 'learning',
    scope: 'admin role',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Retune one agent (name, role, skills, confidence_threshold, learning_rate, bible_priority).',
  },
  {
    id: 'learning.agents.enable',
    method: 'POST',
    template: '/learning/agents/{agent_id}/enable',
    area: 'learning',
    scope: 'admin role',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Enable one agent — its skills join the orchestrator again.',
  },
  {
    id: 'learning.agents.disable',
    method: 'POST',
    template: '/learning/agents/{agent_id}/disable',
    area: 'learning',
    scope: 'admin role',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Disable one agent. The row stays; it stops taking part in runs.',
  },
  {
    id: 'learning.bindings.create',
    method: 'POST',
    template: '/learning/bindings',
    area: 'learning',
    scope: 'admin role',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Bind an agent to an assistant with a role (201). Admin only.',
  },
  {
    id: 'learning.bindings.delete',
    method: 'DELETE',
    template: '/learning/bindings/{assistant_id}/{agent_id}',
    area: 'learning',
    scope: 'admin role',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Unbind an agent from an assistant (204). Admin only.',
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
    id: 'providers.list',
    method: 'GET',
    template: '/providers',
    area: 'assistant',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Public provider catalog — enabled rows only, five selection fields, zero secrets. Feeds the provider/model selectors; anon-safe in every auth mode.',
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
  {
    id: 'admin.providers.refresh_models',
    method: 'POST',
    template: '/admin/ai-providers/{catalog_id}/refresh-models',
    area: 'admin',
    scope: 'settings:write',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Re-fetch the model list for one row; `source` says `remote` (fetched) or `catalog` (declared list returned unchanged).',
  },
  {
    id: 'admin.users.list',
    method: 'GET',
    template: '/admin/users',
    area: 'admin',
    scope: 'user:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Every account (role, enabled, timestamps) — the argon2 hash is never served.',
  },
  {
    id: 'admin.users.create',
    method: 'POST',
    template: '/admin/users',
    area: 'admin',
    scope: 'user:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Create an account; no default password and no sign-up path. Role defaults to `member`.',
  },
  {
    id: 'admin.users.update',
    method: 'PUT',
    template: '/admin/users/{username}',
    area: 'admin',
    scope: 'user:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Change role and/or enabled; disabling revokes the live sessions of that user.',
  },
  {
    id: 'admin.users.password',
    method: 'PUT',
    template: '/admin/users/{username}/password',
    area: 'admin',
    scope: 'user:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Replace a password — every live session for that user is revoked.',
  },
  {
    id: 'admin.users.revoke_sessions',
    method: 'POST',
    template: '/admin/users/{username}/revoke-sessions',
    area: 'admin',
    scope: 'user:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Logout-everywhere for one account; returns a count, never a token.',
  },
  {
    id: 'roles.request.create',
    method: 'POST',
    template: '/role-requests',
    area: 'roles',
    scope: '',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Ask a superadmin for `admin` or `superadmin`. Strict member role and a **session** — a key or a delegated OAuth token answers 403 `session_required`. Reason is 10–1000 chars; 5 asks/min; one pending ask per (account, role), enforced by the index (409 `duplicate_pending`).',
  },
  {
    id: 'roles.request.mine',
    method: 'GET',
    template: '/role-requests/mine',
    area: 'roles',
    scope: '',
    limitDefault: 20,
    limitMax: 100,
    limit: 'query',
    note: "This account's own asks and their decisions, newest first. Filtered by the `user_id` the session proves — no `user_id` parameter exists.",
  },
  {
    id: 'roles.queue',
    method: 'GET',
    template: '/role-requests',
    area: 'roles',
    scope: 'role:manage',
    limitDefault: 50,
    limitMax: 200,
    limit: 'query',
    note: 'The queue: every account\'s asks, defaulting to `status=pending`. `role:manage` **and** the superadmin role, both strict — `role:manage` is the scope that makes a credential a superadmin, and the role half closes the queue if that ever changes.',
  },
  {
    id: 'roles.decision',
    method: 'POST',
    template: '/role-requests/{request_id}/decision',
    area: 'roles',
    scope: 'role:manage',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Approve or reject one ask. Approval runs through the single guarded role writer, so a refusal (`self_role_change`, `last_superadmin`) leaves the request `pending`. A rejection needs a note; decisions are single-use (409 `already_decided`).',
  },
  {
    id: 'records.list',
    method: 'GET',
    template: '/records',
    area: 'knowledge',
    scope: 'dataset:read',
    limitDefault: 50,
    limitMax: 500,
    limit: 'query',
    requiredQuery: ['table'],
    note: 'Whitelisted table rows (dictionary, bible_verses, grammar_patterns, phrases, vocabulary, contributions). Cursor-paginated; free-text filter over search fields. **`table=contributions` is the exception**: it needs `dataset:edit`, not `dataset:read`, and its `email` column is redacted from both the payload and the filter — contributions carry contributor contact details.',
  },
  {
    id: 'audit.list',
    method: 'GET',
    template: '/audit',
    area: 'knowledge',
    scope: 'audit:read',
    limitDefault: 50,
    limitMax: 500,
    limit: 'query',
    note: 'data_audit_log tail (newest first). Optional table/row_id filters. Cursor walks backwards.',
  },
  {
    id: 'review.correct',
    method: 'PATCH',
    template: '/review/records/{table}/{row_id}',
    area: 'admin',
    scope: 'dataset:edit',
    limitDefault: null,
    limitMax: null,
    limit: 'none',
    note: 'Correct fields on a whitelisted row. Each corrected field writes an audit row; review_status set to "reviewed" where the column exists.',
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
  learning: 'Learning agents',
  knowledge: 'Knowledge',
  admin: 'Admin (role-gated)',
  roles: 'Roles & requests',
}

/**
 * The versioned prefix the API is served under. Registry `template`s are relative
 * to it (`API_BASE`), and every path shown to a human is rebased onto it here —
 * one place, because the README, the Links table, and the prose in an Empty panel
 * all have to print the same URL.
 */
export const API_PREFIX = '/api/v1'

/** The public path as the Links page and the README print it. */
export function publicPath(spec: EndpointSpec): string {
  return `${API_PREFIX}${spec.template}`
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
 * The path as it is *written down* for a human: request method plus the versioned
 * prefix, e.g. `GET /api/v1/agent/runs/412`.
 *
 * Prose that names an endpoint must use this, not `endpointPath` alone. The
 * registry stores paths relative to `API_BASE`, so the bare template reads
 * `/agent/runs/412` — which is not a URL anyone can paste, and it drifted: the
 * Dashboard and Search empties printed `/api/v1/...` while the Agent and Assistant
 * panels printed the prefix-less form for the same endpoints, so the copy
 * contradicted itself across the app.
 */
export function documentedPath(
  id: EndpointId,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return `/api/v1${endpointPath(id, params)}`
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

  // Required query params are checked *before* the path is built, so a caller
  // that forgets one fails loudly in development instead of 422-ing in use.
  const query = new URLSearchParams()
  for (const name of spec.requiredQuery ?? []) {
    const value = params[name]
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`queryLimitPath('${id}') is missing the '${name}' query parameter`)
    }
    query.set(name, String(value).trim())
  }
  query.set('limit', String(clamped))
  return `${base}?${query.toString()}`
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
    id: 'rag-limit-ignored',
    title: '/rag ignores `limit` — every response carries 10 snippets',
    body: 'Verified live: `limit` 3 and `limit` 5 both return `retrieved_count: 10` with 10 citations. The Rag panel therefore states the fixed size instead of offering a control that changes nothing.',
  },
  {
    id: 'rag-source-attribution',
    title: '/rag citations carry the headword, not the gloss',
    body: 'The answer is written by the configured model from the retrieved rows and cites them by number, but each citation names only the matched term. The row\'s own definition travels in the context block above it, not on the citation itself.',
  },
  {
    id: 'analyze-empty-sections',
    title: '/analyze/sentence returns empty pos, grammar and entities',
    body: 'Only tokens are populated today. The Analyze panel labels the missing sections instead of showing empty boxes.',
  },
  {
    id: 'morphology-not-populated',
    title: 'The morphology / forms fields **on an entry** are empty',
    body: 'Re-verified: /word/pasian, /word/bang and /word/thei each return entry `forms` 0 and `morphology` 0, so those two entry fields collapse to a "not populated" note rather than a broken panel. This is *not* the /word/{w}/forms sub-resource, which is populated (9-20 rows at limit=20) and renders normally; the two are separate fields and must not be reported as one.',
  },
  {
    id: 'collocations-pmi-zero',
    title: '/word/{w}/collocations reports `pmi` 0.0 for every row',
    body: 'Verified live: every row of /word/pasian/collocations carries `frequency` but `pmi: 0.0` — the server-side `pmiproxy` column that feeds it is unpopulated, which is a data-pipeline gap rather than an API one. The same word\'s own `collocations` field, read from the observation row, *does* carry PMI (/word/pasian → `sangpen` pmi 6.493, freq 14), so the two sources are not interchangeable and the Collocations tab must not present its zeros as "no association".',
  },
  {
    id: 'review-stats-missing',
    title: '/review/stats is not available on the versioned API',
    body: 'Verified live: /api/v1/review/stats answers 404 {"detail":"Not found"}. The unversioned /review/stats 422s because /review/{item_id} swallows "stats". No review count is rendered anywhere in this app as if it were real; only the server-rendered /review/ page is linked.',
  },
  {
    id: 'learning-assignments-empty',
    title: '/learning/assistants and /learning/bindings are live but empty',
    body: 'Verified live: both answer 200 with empty arrays and appear in /openapi.json. The Orchestra page shows "No assistant surfaces yet" for an empty list. A true 404 (route absent on an older deployment) still gets a separate "not available on this deployment" state — empty and missing must not share copy.',
  },
  {
    id: 'learning-run-anonymous-limit',
    title: '/learning/run clamps an anonymous caller to `limit` 50',
    body: 'The server caps the work budget by role (PUBLIC_MAX_LIMIT = 50 for anonymous, 5000 for a recognised key) and says so in the response: `limit_applied` is what ran and `limit_clamped` is true when the request asked for more. The run panel reports both and never implies the full page was produced.',
  },
  {
    id: 'auth-warn-mode',
    title: 'Authentication is in warn mode',
    body: 'Verified live via GET /auth/me: mode is "warn" (not enforce). Public reads stay open; privileged routes still 401 without a credential. The shell banner is sourced from that mode field so it nags only while warn and anonymous — flip to enforce and the 401s become the signal instead.',
  },
] as const