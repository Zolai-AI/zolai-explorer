/**
 * Transport tests for the learning agent surface.
 *
 * The page renders these responses, so the assertions are about what actually
 * goes **on the wire**: method, path, body and the parse. The payloads are
 * verbatim captures from the live API (`GET /learning/agents` on 2026-10-15).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEARNING_TASKS,
  LEARNING_TASK_IDS,
  RESULT_SCALARS,
  bindingsPath,
  deleteLearningBinding,
  enabledAgentCount,
  fetchLearningAgents,
  fetchLearningAssistants,
  fetchLearningBindings,
  fetchLearningOverview,
  fetchLearningSkills,
  patchLearningAgent,
  postLearningAgentState,
  postLearningBinding,
  postLearningRun,
  recountOverview,
  roleLabel,
} from './api'
import { ApiError } from '../../lib/api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Verbatim row from `GET /api/v1/learning/agents`. */
const AGENT_ROW = {
  agent_id: 'bible_learner_001',
  name: 'BibleLearner',
  role: 'bible_learner',
  skills: ['bible_pattern_extraction', 'continuous_learning'],
  enabled: true,
  config: { bible_priority: true, confidence_threshold: 0.85 },
  created_at: '2026-10-14T22:24:23.740668+00:00',
  updated_at: '2026-10-14T22:24:23.740668+00:00',
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function lastCall(): [string, RequestInit] {
  return fetchMock.mock.calls.at(-1) as [string, RequestInit]
}

function lastBody(): Record<string, unknown> {
  return JSON.parse(String(lastCall()[1].body ?? '{}')) as Record<string, unknown>
}

describe('learning reads', () => {
  it('GETs the overview under /api/v1 and parses the counts', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        agents_total: 4,
        agents_enabled: 4,
        agents_disabled: 0,
        skills_total: 15,
        roles: { bible_learner: 1, grammar_expert: 1 },
        seeded_defaults: ['bible_learner_001'],
      }),
    )

    const overview = await fetchLearningOverview()

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/learning/overview')
    expect(init.method ?? 'GET').toBe('GET')
    expect(overview.agents_total).toBe(4)
    expect(overview.roles.grammar_expert).toBe(1)
  })

  it('GETs the roster and keeps the tuning block', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ agents: [AGENT_ROW] }))

    const { agents } = await fetchLearningAgents()

    expect(lastCall()[0]).toBe('/api/v1/learning/agents')
    expect(agents).toHaveLength(1)
    expect(agents[0].config.confidence_threshold).toBe(0.85)
    expect(agents[0].skills).toContain('continuous_learning')
  })

  it('GETs the skill catalog', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        skills: [
          {
            skill_id: 'continuous_learning',
            name: 'Continuous Learning',
            description: 'Keep learning continuously from corpus and feedback',
            category: 'learning',
            enabled: true,
          },
        ],
      }),
    )

    const { skills } = await fetchLearningSkills()

    expect(lastCall()[0]).toBe('/api/v1/learning/skills')
    expect(skills[0].name).toBe('Continuous Learning')
  })

  it('GETs the assistants', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ assistants: [{ assistant_id: 'studio', agents: [], enabled_agents: 2 }] }),
    )

    const { assistants } = await fetchLearningAssistants()

    expect(lastCall()[0]).toBe('/api/v1/learning/assistants')
    expect(enabledAgentCount(assistants[0].enabled_agents)).toBe(2)
  })

  it('builds the bindings path bare or filtered, encoding the assistant id', () => {
    expect(bindingsPath()).toBe('/learning/bindings')
    expect(bindingsPath('studio')).toBe('/learning/bindings?assistant=studio')
    // An id carrying a separator cannot inject a second query parameter.
    expect(bindingsPath('a&limit=9999')).toBe('/learning/bindings?assistant=a%26limit%3D9999')
  })

  it('GETs the bindings with the optional assistant filter', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        bindings: [
          {
            assistant_id: 'studio',
            agent_id: 'bible_learner_001',
            role: 'primary',
            enabled: true,
            agent_name: 'BibleLearner',
            agent_role: 'bible_learner',
            agent_enabled: true,
            confidence_threshold: 0.85,
            skills: ['bible_pattern_extraction'],
          },
        ],
      }),
    )

    const { bindings } = await fetchLearningBindings('studio')

    expect(lastCall()[0]).toBe('/api/v1/learning/bindings?assistant=studio')
    expect(bindings[0].agent_name).toBe('BibleLearner')
  })

  it('degrades to empty lists instead of throwing on a malformed payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ agents: 'nope' }))
    expect((await fetchLearningAgents()).agents).toEqual([])

    fetchMock.mockResolvedValue(jsonResponse({ skills: 42 }))
    expect((await fetchLearningSkills()).skills).toEqual([])

    fetchMock.mockResolvedValue(jsonResponse({ assistants: null }))
    expect((await fetchLearningAssistants()).assistants).toEqual([])

    fetchMock.mockResolvedValue(jsonResponse({ bindings: 'x' }))
    expect((await fetchLearningBindings()).bindings).toEqual([])
  })

  it('surfaces a 401 as an ApiError that reports it needs a key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Not authenticated' }, 401))
    await expect(postLearningAgentState('bible_learner_001', false)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('POST /learning/run', () => {
  it('sends only the fields the chosen task reads', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        task: 'translate',
        result: { translation: 'chang', source: 'go' },
        limit_applied: 10,
        limit_clamped: false,
      }),
    )

    const run = await postLearningRun({
      task: 'translate',
      source_text: '  go  ',
      source_lang: 'en',
      target_lang: 'zo',
      limit: 10,
    })

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/learning/run')
    expect(init.method).toBe('POST')
    expect(lastBody()).toEqual({
      task: 'translate',
      source_text: 'go',
      source_lang: 'en',
      target_lang: 'zo',
      limit: 10,
    })
    expect(run.result.translation).toBe('chang')
  })

  it('never sends an empty source box as an empty string', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ task: 'validate_grammar', result: {}, limit_applied: 10, limit_clamped: false }),
    )

    await postLearningRun({ task: 'validate_grammar', source_text: '   ' })

    expect(lastBody()).not.toHaveProperty('source_text')
  })

  it('clamps the limit to the documented bound before it goes on the wire', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ task: 'build_vocabulary', result: {}, limit_applied: 5000, limit_clamped: false }),
    )

    await postLearningRun({ task: 'build_vocabulary', limit: 99_999 })

    expect(lastBody().limit).toBe(5000)
  })

  it('keeps the server\'s own clamp verdict rather than predicting it', async () => {
    // Verified live: an anonymous caller asking for 500 gets limit_applied 50
    // and limit_clamped true — the client must relay that, not hide it.
    fetchMock.mockResolvedValue(
      jsonResponse({ task: 'validate_grammar', result: {}, limit_applied: 50, limit_clamped: true }),
    )

    const run = await postLearningRun({ task: 'validate_grammar', source_text: 'x', limit: 500 })

    expect(lastBody().limit).toBe(500)
    expect(run.limit_applied).toBe(50)
    expect(run.limit_clamped).toBe(true)
  })

  it('sends min_frequency only for the task that reads it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ task: 'build_vocabulary', result: {}, limit_applied: 10, limit_clamped: false }),
    )

    await postLearningRun({ task: 'build_vocabulary', min_frequency: 5 })
    expect(lastBody().min_frequency).toBe(5)

    fetchMock.mockResolvedValue(
      jsonResponse({ task: 'translate', result: {}, limit_applied: 10, limit_clamped: false }),
    )
    await postLearningRun({ task: 'translate', source_text: 'x', min_frequency: 5 })
    expect(lastBody()).not.toHaveProperty('min_frequency')
  })

  it('sends the language pair only to the task that translates', async () => {
    // RunIn defaults these, so a corpus task that got them would carry fields
    // the server ignores — the panel states it sends only what the task reads.
    fetchMock.mockResolvedValue(
      jsonResponse({
        task: 'learn_bible_patterns',
        result: {},
        limit_applied: 10,
        limit_clamped: false,
      }),
    )

    await postLearningRun({
      task: 'learn_bible_patterns',
      source_lang: 'en',
      target_lang: 'zo',
      pattern_type: 'sov',
    })

    expect(lastBody()).toEqual({ task: 'learn_bible_patterns', pattern_type: 'sov', limit: 10 })
  })
})

describe('admin writes', () => {
  it('PATCHes the agent and sends only the field that changed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(AGENT_ROW))

    await patchLearningAgent('bible_learner_001', { confidence_threshold: 0.9 })

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/learning/agents/bible_learner_001')
    expect(init.method).toBe('PATCH')
    expect(lastBody()).toEqual({ confidence_threshold: 0.9 })
  })

  it('picks enable or disable from the requested state', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...AGENT_ROW, enabled: false }))

    await postLearningAgentState('bible_learner_001', false)
    expect(lastCall()[0]).toBe('/api/v1/learning/agents/bible_learner_001/disable')
    expect(lastCall()[1].method).toBe('POST')

    fetchMock.mockResolvedValue(jsonResponse(AGENT_ROW))
    await postLearningAgentState('bible_learner_001', true)
    expect(lastCall()[0]).toBe('/api/v1/learning/agents/bible_learner_001/enable')
  })

  it('URL-encodes an agent id so it cannot escape its segment', async () => {
    fetchMock.mockResolvedValue(jsonResponse(AGENT_ROW))
    await patchLearningAgent('a/b', { name: 'x' })
    expect(lastCall()[0]).toBe('/api/v1/learning/agents/a%2Fb')
  })

  it('POSTs a binding and defaults the role to primary', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 201))

    await postLearningBinding({ assistant_id: 'studio', agent_id: 'translator_001', role: '  ' })

    expect(lastCall()[0]).toBe('/api/v1/learning/bindings')
    expect(lastCall()[1].method).toBe('POST')
    expect(lastBody()).toEqual({
      assistant_id: 'studio',
      agent_id: 'translator_001',
      role: 'primary',
    })
  })

  it('DELETEs a binding and tolerates the empty 204 body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await deleteLearningBinding('studio', 'translator_001')

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/learning/bindings/studio/translator_001')
    expect(init.method).toBe('DELETE')
  })
})

describe('pure helpers', () => {
  it('offers exactly the orchestrator tasks the server accepts', () => {
    expect(LEARNING_TASKS.map((task) => task.id)).toEqual([...LEARNING_TASK_IDS])
    for (const task of LEARNING_TASKS) {
      expect(RESULT_SCALARS[task.id].length, task.id).toBeGreaterThan(0)
    }
  })

  it('marks the text tasks, so the panel can require a box', () => {
    expect(LEARNING_TASKS.filter((task) => task.text).map((task) => task.id)).toEqual([
      'translate',
      'validate_grammar',
      'correct_grammar',
    ])
  })

  it('recounts the overview so the tiles cannot disagree with the roster', () => {
    const counted = recountOverview({
      agents_total: 4,
      agents_enabled: 4,
      agents_disabled: 0,
      skills_total: 15,
      roles: { bible_learner: 1 },
      seeded_defaults: [],
      agents: [AGENT_ROW, { ...AGENT_ROW, agent_id: 'grammar_expert_001', enabled: false }],
    })

    expect(counted.agents_total).toBe(2)
    expect(counted.agents_enabled).toBe(1)
    expect(counted.agents_disabled).toBe(1)
  })

  it('leaves the overview alone when no roster is inlined', () => {
    const overview = {
      agents_total: 4,
      agents_enabled: 4,
      agents_disabled: 0,
      skills_total: 15,
      roles: {},
      seeded_defaults: [],
      agents: [],
    }
    expect(recountOverview(overview)).toBe(overview)
  })

  it('normalises enabled_agents whether the server sends a count or ids', () => {
    expect(enabledAgentCount(2)).toBe(2)
    expect(enabledAgentCount(['a', 'b'])).toBe(2)
    expect(enabledAgentCount(null)).toBe(0)
  })

  it('renders a role id as words without inventing a vocabulary', () => {
    expect(roleLabel('grammar_expert')).toBe('Grammar expert')
    expect(roleLabel('bible')).toBe('Bible')
    expect(roleLabel('  ')).toBe('—')
  })
})