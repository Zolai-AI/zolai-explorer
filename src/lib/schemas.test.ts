import { describe, expect, it } from 'vitest'
import {
  AgentRunSchema,
  ChatResponseSchema,
  ContributionReceiptSchema,
  FeedbackSchema,
  HealthSchema,
  KnowledgeVersionSchema,
  MyContributionListSchema,
  MyContributionSchema,
  ParagraphAnalysisSchema,
  ProviderListSchema,
  ProviderSchema,
  ProviderTestSchema,
  RagSchema,
  RoleDecisionInputSchema,
  RoleRequestCreatedSchema,
  RoleRequestDecisionSchema,
  RoleRequestInputSchema,
  RoleRequestListSchema,
  RoleRequestQueueSchema,
  RoleRequestSchema,
  SearchSchema,
  SentenceAnalysisSchema,
  StatisticsSchema,
  WordCollocationsSchema,
  WordContextSchema,
  WordContextsSchema,
  WordEvidenceSchema,
  WordFormsSchema,
  WordRelatedSchema,
  WordPatternsSchema,
  WordSchema,
  parseOrThrow,
} from './schemas'

/**
 * Payloads below are trimmed verbatim from the LIVE API at
 * https://api.zolai.space (verified during this build), including the real
 * "empty" shapes that the UI has to survive.
 */

describe('health', () => {
  it('parses the live /health payload', () => {
    // Verbatim shape of `GET https://api.zolai.space/health` on 2026-10-30: no
    // `data_root` — the public probe dropped the container path (core#16).
    const parsed = HealthSchema.parse({
      status: 'ok',
      version: '2.0.0',
      uptime_s: 607.545,
      engine_mode: 'hybrid',
      llm_allowed: true,
    })
    expect(parsed.status).toBe('ok')
    expect(parsed.uptime_s).toBeCloseTo(607.545)
    expect(parsed.engine_mode).toBe('hybrid')
    expect(parsed.llm_allowed).toBe(true)
    expect(parsed).not.toHaveProperty('data_root')
  })

  it('falls back rather than throwing when fields are missing', () => {
    const parsed = HealthSchema.parse({})
    expect(parsed.status).toBe('')
    expect(parsed.uptime_s).toBe(0)
    expect(parsed.engine_mode).toBe('')
    expect(parsed.llm_allowed).toBe(false)
  })
})

describe('statistics + version', () => {
  it('parses the live /knowledge/statistics payload', () => {
    const parsed = StatisticsSchema.parse({
      stats: {
        'dictionary entries': 84490,
        'EN→ZO entries': 64025,
        'Bible verses': 31102,
        'vocabulary items': 104906,
        'phrases': 10722,
        'grammar patterns': 6063,
        collocations: 5000,
        'knowledge claims': 172,
        hypotheses: 612,
        evidence: 1751,
        'KG nodes': 2,
        'KG edges': 1,
      },
    })
    expect(parsed.stats['dictionary entries']).toBe(84490)
    expect(parsed.stats['Bible verses']).toBe(31102)
    expect(Object.keys(parsed.stats)).toHaveLength(12)
  })

  it('parses the live /knowledge/version payload', () => {
    const parsed = KnowledgeVersionSchema.parse({
      version: 'v2026.10.0-new-v85474',
      git_commit: '397dc5eec1bb',
      created_at: '2026-10-03T11:34:46.710540+00:00',
    })
    expect(parsed.git_commit).toHaveLength(12)
  })

  it('collapses a missing stats object to {}', () => {
    expect(StatisticsSchema.parse({}).stats).toEqual({})
  })
})

describe('word', () => {
  const liveWord = {
    word: 'pasian',
    forms: [],
    frequency: 5223,
    document_frequency: 64,
    sentence_frequency: 0,
    pos: ['Noun', 'NOUN'],
    morphology: {},
    examples: ['God', 'KG node: pasian (word)', 'Freq: 5123'],
    collocations: [
      { word1: 'pasian', word2: 'sangpen', pmi: 6.493, freq: 14 },
      { word1: 'pasian', word2: 'singkuang', pmi: 5.173, freq: 48 },
    ],
    grammar_usage: [],
    sources: ['dictionary', 'kg_nodes', 'word_observation_stats'],
    confidence: 0.86,
  }

  it('parses the live /word/pasian payload including its empty sections', () => {
    const parsed = WordSchema.parse(liveWord)
    expect(parsed.word).toBe('pasian')
    expect(parsed.frequency).toBe(5223)
    // Live gaps the UI must handle without rendering a broken panel:
    expect(parsed.forms).toEqual([])
    expect(parsed.sentence_frequency).toBe(0)
    expect(parsed.morphology).toEqual({})
    expect(parsed.grammar_usage).toEqual([])
    expect(parsed.confidence).toBe(0.86)
  })

  it('parses the live all-zero "unknown word" payload without error', () => {
    const parsed = WordSchema.parse({
      word: 'zzzznotaword',
      forms: [],
      frequency: 0,
      document_frequency: 0,
      sentence_frequency: 0,
      pos: [],
      morphology: {},
      examples: [],
      collocations: [],
      grammar_usage: [],
      sources: [],
      confidence: 0,
    })
    expect(parsed.frequency).toBe(0)
    expect(parsed.sources).toEqual([])
  })

  it('defaults every missing field so a sparse payload still renders', () => {
    const parsed = WordSchema.parse({ word: 'gam' })
    expect(parsed.forms).toEqual([])
    expect(parsed.collocations).toEqual([])
    expect(parsed.examples).toEqual([])
    expect(parsed.morphology).toEqual({})
    expect(parsed.confidence).toBe(0)
  })

  it('parses /word/{w}/forms', () => {
    const parsed = WordFormsSchema.parse({
      word: 'pasian',
      forms: ['pasian', 'pasian-a', 'pasian-in'],
    })
    expect(parsed.forms).toHaveLength(3)
  })

  it('parses /word/{w}/contexts with parallel Bible columns', () => {
    const parsed = WordContextsSchema.parse({
      word: 'pasian',
      contexts: [
        {
          source: 'bible_verses',
          ref: '1CH 4:10',
          en: 'And Jabez called on the God of Israel',
          zo_tdb77: 'Jabez in Israel Pasian tungah thu ngen a',
          zo_tedim2010: 'Jabez in Israel Pasian tungah thu ngen a',
        },
      ],
    })
    expect(parsed.contexts[0].ref).toBe('1CH 4:10')
  })

  it('tolerates a context row with only a reference', () => {
    const parsed = WordContextsSchema.parse({
      word: 'pasian',
      contexts: [{ ref: 'GEN 1:1' }],
    })
    const row: unknown = parsed.contexts[0]
    expect(WordContextSchema.safeParse(row).success).toBe(true)
    expect(parsed.contexts[0].zo_tdb77).toBe('')
  })

  it('parses /word/{w}/collocations, which uses `frequency` not `freq`', () => {
    const parsed = WordCollocationsSchema.parse({
      word: 'pasian',
      collocations: [{ word1: 'pasian', word2: 'hong', frequency: 253, pmi: 0 }],
    })
    expect(parsed.collocations[0].frequency).toBe(253)
  })

  it('parses /word/{w}/patterns with a null confidence', () => {
    const parsed = WordPatternsSchema.parse({
      word: 'pasian',
      patterns: [
        {
          pattern_id: 'pat_7427d3bd',
          pattern: 'ciangin-Pasian',
          description: '',
          function: '',
          examples: ['1CH 4:10', '1CH 13:10'],
          confidence: null,
          status: 'OBSERVED',
        },
      ],
    })
    expect(parsed.patterns[0].confidence).toBeNull()
    expect(parsed.patterns[0].status).toBe('OBSERVED')
  })

  it('parses /word/{w}/evidence including nested metadata', () => {
    const parsed = WordEvidenceSchema.parse({
      word: 'pasian',
      evidence: [
        {
          source_type: 'dictionary',
          source: 'dictionary',
          tier: 2,
          confidence: 0.9,
          text: 'God',
          metadata: { word: 'pasian', definition: 'God', pos: null, frequency: 0 },
        },
      ],
    })
    expect(parsed.evidence[0].tier).toBe(2)
    expect(parsed.evidence[0].metadata).toMatchObject({ definition: 'God' })
  })

  it('parses /word/{w}/related neighbours', () => {
    const parsed = WordRelatedSchema.parse({
      word: 'pasian',
      related: [
        {
          word: 'pasiante',
          pos: null,
          frequency: 163,
          relation: 'prefix',
          shared_prefix: 6,
        },
      ],
    })
    expect(parsed.related[0].word).toBe('pasiante')
    expect(parsed.related[0].pos).toBeNull()
    expect(parsed.related[0].relation).toBe('prefix')
  })

  it('collapses missing sub-resource arrays to []', () => {
    expect(WordFormsSchema.parse({ word: 'x' }).forms).toEqual([])
    expect(WordContextsSchema.parse({ word: 'x' }).contexts).toEqual([])
    expect(WordCollocationsSchema.parse({ word: 'x' }).collocations).toEqual([])
    expect(WordPatternsSchema.parse({ word: 'x' }).patterns).toEqual([])
    expect(WordEvidenceSchema.parse({ word: 'x' }).evidence).toEqual([])
    expect(WordRelatedSchema.parse({ word: 'x' }).related).toEqual([])
  })
})

describe('analyze', () => {
  it('parses the live /analyze/sentence payload with empty pos/grammar/entities', () => {
    const parsed = SentenceAnalysisSchema.parse({
      text: 'Pasian in leitung a piangsak hi.',
      tokens: ['pasian', 'in', 'leitung', 'a', 'piangsak', 'hi'],
      pos: [],
      grammar: [],
      entities: [],
    })
    expect(parsed.tokens).toHaveLength(6)
    // Documented gap: these are not populated by the live API yet.
    expect(parsed.pos).toEqual([])
    expect(parsed.grammar).toEqual([])
    expect(parsed.entities).toEqual([])
  })

  it('parses the live thin /analyze/paragraph analysis block', () => {
    const parsed = ParagraphAnalysisSchema.parse({
      text: 'Pasian om hi. Gam ka mu hi.',
      sentences: ['Pasian om hi. Gam ka mu hi.'],
      analysis: {
        status: 'tokenized',
        note: 'segmentation complete; POS/grammar via discovery pipeline',
        tokens_per_sentence: [7],
      },
    })
    expect(parsed.sentences).toHaveLength(1)
    expect(parsed.analysis.status).toBe('tokenized')
  })
})

describe('search', () => {
  it('parses the live /search payload', () => {
    const parsed = SearchSchema.parse({
      query: 'pasian',
      results: [
        {
          id: 'bible_verses:1CH 4:10',
          text: 'Jabez in Israel Pasian tungah thu ngen a',
          score: 1,
          source: 'bible_verses',
          metadata: {},
        },
      ],
    })
    expect(parsed.results[0].source).toBe('bible_verses')
    expect(parsed.results[0].metadata).toEqual({})
  })

  it('collapses an empty result set to []', () => {
    expect(SearchSchema.parse({ query: 'zzz', results: [] }).results).toEqual([])
    expect(SearchSchema.parse({ query: 'zzz' }).results).toEqual([])
  })
})

describe('rag', () => {
  it('parses the live /rag payload with the placeholder answer', () => {
    const parsed = RagSchema.parse({
      question: 'gam',
      context: '[1] bible_verses: ...',
      citations: [{ id: 1, source: 'bible_verses', text: 'Eber sung pan a piang' }],
      answer: 'Based on 10 sources: [1] bible_verses: ...',
      retrieved_count: 10,
    })
    expect(parsed.retrieved_count).toBe(10)
    expect(parsed.citations).toHaveLength(1)
    expect(parsed.citations[0].source).toBe('bible_verses')
  })

  it('parses a zero-retrieval response', () => {
    const parsed = RagSchema.parse({
      question: 'What did God create?',
      context: '',
      citations: [],
      answer: 'Based on 0 sources: ...',
      retrieved_count: 0,
    })
    expect(parsed.retrieved_count).toBe(0)
    expect(parsed.context).toBe('')
  })

  it('tolerates a citation without a usable id', () => {
    const parsed = RagSchema.parse({
      question: 'q',
      context: '',
      citations: [{ source: 'dictionary', text: 'x' }],
      answer: 'a',
      retrieved_count: 1,
    })
    expect(parsed.citations[0].id).toBe(0)
  })
})

describe('parseOrThrow', () => {
  it('returns typed data on success', () => {
    expect(parseOrThrow(HealthSchema, { status: 'ok' }, 'health').status).toBe('ok')
  })

  it('throws a readable message naming the endpoint', () => {
    expect(() => parseOrThrow(StatisticsSchema, 'not-an-object', 'statistics')).toThrow(
      /Unexpected statistics payload/,
    )
  })

  it('rescues a wrongly-typed nested field instead of failing the whole payload', () => {
    // `stats` is deliberately tolerant: a bad value degrades to {} so the
    // dashboard renders an empty state rather than an error wall.
    expect(parseOrThrow(StatisticsSchema, { stats: 'not-an-object' }, 'statistics').stats).toEqual({})
  })
})

/** Trimmed from the deployed `/admin/ai-providers` contract (ADR-014). */
const PROVIDER_ROW = {
  catalog_id: 'primary',
  name: 'Primary',
  adapter: 'brain',
  base_url: 'https://provider.example/v1',
  models: ['model-a', 'model-b'],
  selected_model: 'model-a',
  docs: '',
  requires_key: true,
  enabled: true,
  is_active: true,
  tier: 'free',
  timeout_s: 45,
  secret: { mode: 'env', ref_masked: '***BRIDGE_KEY', configured: true },
}

describe('ai provider catalog', () => {
  it('parses a catalog row, including the masked secret view', () => {
    const parsed = ProviderSchema.parse(PROVIDER_ROW)
    expect(parsed.catalog_id).toBe('primary')
    expect(parsed.adapter).toBe('brain')
    expect(parsed.secret.configured).toBe(true)
    // The mask is the only secret material a row may carry.
    expect(parsed.secret.ref_masked).not.toContain('key_')
  })

  it('never yields a plaintext secret — a bad mode degrades to none', () => {
    const parsed = ProviderSchema.parse({
      ...PROVIDER_ROW,
      secret: { mode: 'plaintext-oops', ref_masked: '', configured: false },
    })
    expect(parsed.secret.mode).toBe('none')
    expect(parsed.secret.configured).toBe(false)
  })

  it('degrades a partial row instead of rejecting the whole catalog', () => {
    const parsed = ProviderListSchema.parse({ items: [PROVIDER_ROW, { name: 'half' }], count: 2 })
    expect(parsed.count).toBe(2)
    expect(parsed.items[0].catalog_id).toBe('primary')
    expect(parsed.items[1].catalog_id).toBe('')
    expect(parsed.items[1].models).toEqual([])
  })

  it('reads a test probe result with a null status on failure', () => {
    const parsed = ProviderTestSchema.parse({
      catalog_id: 'primary',
      ok: false,
      status: null,
      latency_ms: 12,
      error: 'no credential',
      model: null,
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.status).toBeNull()
    expect(parsed.error).toBe('no credential')
  })
})

describe('assistant chat response', () => {
  it('parses a retrieval-only answer and labels it as such', () => {
    const parsed = ChatResponseSchema.parse({
      answer: 'pasian = God',
      citations: [{ source: 'dictionary', ref: 'pasian', text: 'God', score: 0.91 }],
      tool_calls: [],
      turns: 1,
      provider: '',
      model: '',
      mode: 'retrieval_only',
      retrieval_only: true,
      latency_ms: 8,
      zvs: {},
      provider_error: 'no credential',
      loop_error: '',
      persisted_run_id: null,
    })
    // The honesty contract: retrieval_only is preserved so the UI can refuse
    // to call the answer "generated".
    expect(parsed.retrieval_only).toBe(true)
    expect(parsed.citations[0].score).toBeCloseTo(0.91)
    expect(parsed.persisted_run_id).toBeNull()
  })

  it('collapses missing citations/tools to empty arrays, not errors', () => {
    const parsed = ChatResponseSchema.parse({ answer: 'hi', retrieval_only: false })
    expect(parsed.citations).toEqual([])
    expect(parsed.tool_calls).toEqual([])
    expect(parsed.retrieval_only).toBe(false)
  })

  it('keeps the anonymous generation gate — why retrieval ran matters', () => {
    const gated = ChatResponseSchema.parse({
      answer: 'a',
      retrieval_only: true,
      generation_requires_auth: true,
    })
    expect(gated.generation_requires_auth).toBe(true)
    // Absent means "no credential was the blocker", not "sign in to generate".
    expect(ChatResponseSchema.parse({ answer: 'a' }).generation_requires_auth).toBe(false)
  })

  it('keeps a list result intact — rag_search returns rows, not a dict', () => {
    // Regression: `data` was typed `record` (a dict with a `.catch({})`
    // fallback), so every list payload — which is what a search returns — was
    // silently collapsed to `{}` and the trace could never show a result.
    const parsed = ChatResponseSchema.parse({
      answer: 'a',
      tool_calls: [
        {
          name: 'rag_search',
          ok: true,
          status: 'completed',
          latency_ms: 12,
          turn: 1,
          input: { query: 'pasian', limit: 5 },
          data: [{ ref: 'kb/1', text: 'God' }],
          error: '',
          error_code: '',
        },
      ],
    })
    expect(parsed.tool_calls[0].data).toEqual([{ ref: 'kb/1', text: 'God' }])
    expect(parsed.tool_calls[0].input).toEqual({ query: 'pasian', limit: 5 })
  })

  it('keeps the failure class of a failed call', () => {
    const parsed = ChatResponseSchema.parse({
      answer: 'a',
      tool_calls: [
        {
          name: 'verse_lookup',
          ok: false,
          status: 'failed',
          latency_ms: 3,
          turn: 2,
          input: { reference: 'gen 1:1' },
          data: undefined,
          error: 'no such verse',
          error_code: 'not_found',
        },
      ],
    })
    expect(parsed.tool_calls[0].error).toBe('no such verse')
    expect(parsed.tool_calls[0].error_code).toBe('not_found')
  })

  it('keeps an absent persisted_run_id null-ish rather than a bogus id', () => {
    // `nullableNum`: absent → undefined, explicit null → null. Both are
    // falsy, which is all the UI needs to hide the "persisted" hint.
    const absent = ChatResponseSchema.parse({ answer: 'hi', persisted_run_id: undefined })
    const nullish = ChatResponseSchema.parse({ answer: 'hi', persisted_run_id: null })
    expect(absent.persisted_run_id ?? null).toBeNull()
    expect(nullish.persisted_run_id).toBeNull()
    expect(ChatResponseSchema.parse({ answer: 'hi', persisted_run_id: 3 }).persisted_run_id).toBe(3)
  })
})

describe('agent run', () => {
  const RUN_ROW = {
    id: 7,
    goal: 'audit ZVS forms in proverbs',
    status: 'succeeded',
    phases: {
      research: { status: 'ok', tools: ['kb_search'], evidence_count: 3, outcome: '', latency_ms: 40, error: '' },
    },
    tool_calls: [],
    evidence: [{ source: 'proverbs', ref: 'x' }],
    answer: 'done',
    provider: 'primary',
    model: 'model-a',
    turns: 3,
    latency_ms: 900,
    outcome: 'generated',
    feedback_score: null,
    error: '',
    mode: 'rule',
    created_by: 'key:zl_ab12',
    created_at: '2026-10-04T10:00:00Z',
    finished_at: null,
  }

  it('parses a finished run with its phase table', () => {
    const parsed = AgentRunSchema.parse(RUN_ROW)
    expect(parsed.id).toBe(7)
    expect(parsed.status).toBe('succeeded')
    expect(parsed.phases.research.status).toBe('ok')
    expect(parsed.phases.research.evidence_count).toBe(3)
    expect(parsed.feedback_score).toBeNull()
    expect(parsed.finished_at).toBeNull()
  })

  it('survives a run whose phases have not been written yet', () => {
    const parsed = AgentRunSchema.parse({ id: 8, goal: 'g', status: 'running' })
    expect(parsed.phases).toEqual({})
    expect(parsed.tool_calls).toEqual([])
    expect(parsed.evidence).toEqual([])
    // Not yet voted / not yet finished — both render as "no value".
    expect(parsed.feedback_score ?? null).toBeNull()
    expect(parsed.finished_at ?? null).toBeNull()
  })

  it('parses a feedback payload that carries the updated run', () => {
    const parsed = FeedbackSchema.parse({
      run_id: 7,
      feedback_score: 1,
      run: RUN_ROW,
      learn: { created_hypothesis_id: 12 },
    })
    expect(parsed.run_id).toBe(7)
    expect(parsed.feedback_score).toBe(1)
    expect(parsed.run.status).toBe('succeeded')
    expect(parsed.learn.created_hypothesis_id).toBe(12)
  })
})

/* --------------------------------------------------------------------------
 * Role requests + contributions.
 *
 * Shapes are read off the server, not invented: `_ROLE_REQUEST_COLUMNS` in
 * `zolai/api/session_auth.py` is the column list every role-request route
 * returns, `MINE_COLUMNS` is the fixed projection of
 * `GET /contributions/mine`, and the envelopes come from the `return`
 * statements of `role_requests_router.py`.
 * ----------------------------------------------------------------------- */

/** Verbatim `SELECT` list, as a pending ask looks before anyone decides it. */
const PENDING_ASK = {
  id: 3,
  user_id: 7,
  username: 'peter',
  requested_role: 'superadmin',
  reason: 'I maintain the provider settings for the studio and need to clear contributor asks.',
  status: 'pending',
  created_at: '2026-10-30T09:12:44.318Z',
  decided_by: null,
  decided_at: null,
  note: null,
}

const APPROVED_ASK = {
  ...PENDING_ASK,
  status: 'approved',
  decided_by: 'admin-peter',
  decided_at: '2026-10-30T11:02:09.771Z',
  note: 'Approved — you have the provider lane.',
}

describe('role request (read)', () => {
  it('parses a pending ask with its audit columns empty', () => {
    const parsed = RoleRequestSchema.parse(PENDING_ASK)
    expect(parsed.id).toBe(3)
    expect(parsed.username).toBe('peter')
    expect(parsed.requested_role).toBe('superadmin')
    expect(parsed.status).toBe('pending')
    expect(parsed.decided_by ?? null).toBeNull()
    expect(parsed.decided_at ?? null).toBeNull()
    expect(parsed.note ?? null).toBeNull()
  })

  it('keeps the decision trail of a decided ask', () => {
    const parsed = RoleRequestSchema.parse(APPROVED_ASK)
    expect(parsed.status).toBe('approved')
    // `decided_by` is the resolved identity the server wrote, not a caller field.
    expect(parsed.decided_by).toBe('admin-peter')
    expect(parsed.note).toMatch(/provider lane/)
  })

  it('reads an unrecognised status as still pending', () => {
    // `.catch('pending')` is the conservative direction: a row whose status this
    // build cannot read stays visible in the queue instead of disappearing with
    // no decision ever made.
    expect(RoleRequestSchema.parse({ ...PENDING_ASK, status: 'withdrawn' }).status).toBe('pending')
    expect(RoleRequestSchema.parse({ ...PENDING_ASK, status: null }).status).toBe('pending')
  })

  it('drops the reason rather than the row when it arrives wrongly typed', () => {
    const parsed = parseOrThrow(RoleRequestSchema, { ...PENDING_ASK, reason: 42 }, 'role-requests')
    expect(parsed.reason).toBe('')
    expect(parsed.id).toBe(3)
  })
})

describe('role request lists (mine + the queue)', () => {
  it('parses /mine as {items, count} newest first', () => {
    const parsed = RoleRequestListSchema.parse({
      items: [APPROVED_ASK, PENDING_ASK],
      count: 2,
    })
    expect(parsed.count).toBe(2)
    expect(parsed.items.map((r) => r.status)).toEqual(['approved', 'pending'])
  })

  it('parses an empty queue on a store with no asks yet', () => {
    const parsed = RoleRequestQueueSchema.parse({ status: 'pending', items: [], count: 0 })
    expect(parsed.status).toBe('pending')
    expect(parsed.items).toEqual([])
  })

  it('answers "all" when the queue carries no filter', () => {
    // The server sends `resolved or "all"`, so an unset filter is the word
    // `all` — and a filter string this build does not know degrades to the
    // same, i.e. the widest view, which is what the queue is for.
    expect(RoleRequestQueueSchema.parse({ items: [], count: 0 }).status).toBe('all')
    expect(RoleRequestQueueSchema.parse({ status: 'awaiting', items: [], count: 0 }).status).toBe(
      'all',
    )
  })

  it('survives a malformed items array instead of failing the page', () => {
    const parsed = parseOrThrow(RoleRequestListSchema, { items: 'nope', count: 0 }, 'role-requests')
    expect(parsed.items).toEqual([])
  })
})

describe('role request writes (the input schemas refuse, they never guess)', () => {
  it('accepts the two requestable roles', () => {
    expect(RoleRequestInputSchema.parse({ requested_role: 'admin', reason: 'x'.repeat(10) })).toEqual(
      { requested_role: 'admin', reason: 'x'.repeat(10) },
    )
    expect(RoleRequestInputSchema.safeParse({ requested_role: 'superadmin', reason: 'y' }).success).toBe(
      true,
    )
  })

  it('refuses a role that is not an ask', () => {
    // Every account starts as `member`, so asking for it is a server 400
    // (`role_not_requestable`); there is no fallback value that would not be a
    // privilege invented from a parse failure.
    expect(RoleRequestInputSchema.safeParse({ requested_role: 'member', reason: 'x'.repeat(10) }).success).toBe(
      false,
    )
    expect(RoleRequestInputSchema.safeParse({ reason: 'x'.repeat(10) }).success).toBe(false)
    expect(RoleRequestInputSchema.safeParse({ requested_role: 'overlord', reason: 'x' }).success).toBe(
      false,
    )
  })

  it('degrades an over-long reason to empty rather than throwing', () => {
    // The form caps the reason before submit; the server states its own refusal
    // for one that is too short, so an unreadable value must not become a
    // sentence the applicant never wrote.
    const parsed = RoleRequestInputSchema.parse({ requested_role: 'admin', reason: 'z'.repeat(1001) })
    expect(parsed.reason).toBe('')
    expect(parsed.requested_role).toBe('admin')
  })

  it('requires the decision word and tolerates a blank note', () => {
    expect(RoleDecisionInputSchema.parse({ decision: 'approve' })).toEqual({
      decision: 'approve',
      note: '',
    })
    expect(RoleDecisionInputSchema.safeParse({ decision: 'maybe' }).success).toBe(false)
    expect(RoleDecisionInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('role request envelopes (created + decided)', () => {
  const USER_ROW = {
    id: 7,
    username: 'peter',
    display_name: null,
    role: 'superadmin',
    enabled: 1,
    created_at: '2026-10-28T06:31:02.004Z',
    updated_at: '2026-10-30T11:02:09.771Z',
    last_login: '2026-10-30T09:10:00.000Z',
  }

  it('parses the 201 body of a new ask', () => {
    const parsed = RoleRequestCreatedSchema.parse({
      request: PENDING_ASK,
      message: "Request #3 for 'superadmin' is queued for a superadmin.",
    })
    expect(parsed.request.status).toBe('pending')
    expect(parsed.message).toMatch(/queued for a superadmin/)
  })

  it('parses an approval carrying the promoted account', () => {
    const parsed = RoleRequestDecisionSchema.parse({
      request: APPROVED_ASK,
      user: USER_ROW,
      message: "Request #3 approved; 'peter' is now 'superadmin'.",
    })
    expect(parsed.user?.role).toBe('superadmin')
    // The server stores `enabled` as 0 | 1; the panel must not branch on a number.
    expect(parsed.user?.enabled).toBe(true)
    expect(parsed.message).toMatch(/approved/)
  })

  it('reads a rejection as no row changed', () => {
    // `user` is null on a rejection because nothing was written — and an absent
    // key parses the same way, so the UI has one state to render.
    const rejected = RoleRequestDecisionSchema.parse({
      request: { ...PENDING_ASK, status: 'rejected', note: 'Not yet — the studio lane is enough.' },
      user: null,
      message: 'Request #3 rejected.',
    })
    expect(rejected.user).toBeNull()
    // Absent → `undefined`, present-but-null → `null`; `?? null` is the house
    // read-site idiom, and both mean the same thing here: nothing was written.
    expect(RoleRequestDecisionSchema.parse({ request: PENDING_ASK, message: 'x' }).user ?? null).toBeNull()
  })

  it('strips a credential column if a server regression ever adds one', () => {
    // `sanitize_user` removes `password_hash` before the response is built. zod
    // drops unknown keys, so even a regression cannot carry a hash into state.
    const parsed = RoleRequestDecisionSchema.parse({
      request: APPROVED_ASK,
      user: { ...USER_ROW, password_hash: 'NOT-A-REAL-HASH-PLACEHOLDER' },
      message: 'x',
    })
    expect(parsed.user).not.toHaveProperty('password_hash')
  })
})

describe('contributions (own rows + the submit receipt)', () => {
  /** Verbatim `MINE_COLUMNS` projection from `contributions_router.py`. */
  const MINE_ROW = {
    id: 41,
    type: 'dictionary',
    word: 'zomi',
    field: 'definition',
    status: 'pending',
    created_at: '2026-10-29T18:02:11.402Z',
    reviewed_at: null,
    reviewed_by: null,
  }

  it('parses the fixed projection and never an email', () => {
    const parsed = MyContributionSchema.parse(MINE_ROW)
    expect(parsed.word).toBe('zomi')
    expect(parsed.status).toBe('pending')
    expect(parsed.reviewed_at ?? null).toBeNull()
    // Privacy property, not an oversight: an address offered for editorial
    // contact is not this route's to give away, so it is absent from the SELECT
    // and stripped from the parsed object even if a future server leaks it.
    expect(MyContributionSchema.parse({ ...MINE_ROW, email: 'someone@example.invalid' })).not.toHaveProperty(
      'email',
    )
  })

  it('keeps the review trail of an accepted row', () => {
    const parsed = MyContributionSchema.parse({
      ...MINE_ROW,
      status: 'accepted',
      reviewed_at: '2026-10-30T08:00:00.000Z',
      reviewed_by: 'editor',
    })
    expect(parsed.status).toBe('accepted')
    expect(parsed.reviewed_by).toBe('editor')
  })

  it('parses {items, count} and survives a malformed page', () => {
    expect(MyContributionListSchema.parse({ items: [MINE_ROW], count: 1 }).count).toBe(1)
    expect(parseOrThrow(MyContributionListSchema, { items: null, count: 0 }, 'contributions/mine').items).toEqual(
      [],
    )
  })

  it('reads the receipt attribution as the server wrote it', () => {
    // `attributed_to` is derived from the resolved credential — a username for a
    // session, a key label for a key, null for an anonymous submission. The
    // client never sends an identity field, so this is read-back only.
    expect(
      ContributionReceiptSchema.parse({
        id: 42,
        status: 'pending',
        message: 'Contribution received and queued for editorial review.',
        attributed_to: 'peter',
      }).attributed_to,
    ).toBe('peter')
    expect(
      ContributionReceiptSchema.parse({ id: 42, status: 'pending', message: 'x', attributed_to: null })
        .attributed_to,
    ).toBeNull()
    expect(
      ContributionReceiptSchema.parse({ id: 42, status: 'pending', message: 'x' }).attributed_to ?? null,
    ).toBeNull()
  })
})