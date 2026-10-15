/**
 * Transport guards for the RAG panel.
 *
 * `RAGRequest` on the server has accepted an optional `provider` / `model`
 * override since it was documented as "resolved exactly as the assistant
 * resolves them" — but this binding never sent them, so the panel could only
 * ever answer with whatever the deployment happened to have configured, and the
 * control to choose otherwise did not exist.
 */
import { describe, expect, it } from 'vitest'
import { ragBody } from './api'

describe('ragBody — the override must reach the wire', () => {
  it('sends only question and limit when nothing is chosen', () => {
    expect(ragBody('What is pasian?', 5)).toEqual({ question: 'What is pasian?', limit: 5 })
  })

  it('omits empty strings so the server keeps its own resolution', () => {
    // Sending `provider: ""` would be an explicit override of nothing; the
    // server must see the field absent.
    const body = ragBody('q', 5, { provider: '', model: '' })
    expect(body).not.toHaveProperty('provider')
    expect(body).not.toHaveProperty('model')
  })

  it('sends the chosen provider', () => {
    expect(ragBody('q', 5, { provider: 'primary', model: '' })).toMatchObject({
      provider: 'primary',
    })
  })

  it('sends provider and model together', () => {
    expect(ragBody('q', 3, { provider: 'primary', model: 'model-x' })).toEqual({
      question: 'q',
      limit: 3,
      provider: 'primary',
      model: 'model-x',
    })
  })

  it('never invents a `user_provider` — the client must not name a vendor', () => {
    const body = ragBody('q', 5, { provider: 'primary', model: '' })
    expect(Object.keys(body).sort()).toEqual(['limit', 'provider', 'question'])
  })
})
