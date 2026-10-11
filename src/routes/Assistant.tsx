import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageSquareQuote, Send, ShieldCheck, Wrench, Key, Lock, Copy, ThumbsUp, ThumbsDown } from 'lucide-react'
import { toast } from 'sonner'
import { useAssistantChat, type AssistantMode } from '../features/assistant/api'
import { useProviderCatalog } from '../features/providers/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorState } from '../components/ErrorState'
import { ProviderModelSelect } from '../components/ProviderModelSelect'
import { Skeleton } from '../components/Skeleton'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'
import { Field, FieldDescription, FieldLabel } from '../components/ui/field'
import { can, useRole } from '../lib/auth'
import { formatCount, formatScore } from '../lib/format'
import type { ChatResponse, ProviderSelection } from '../lib/schemas'

type Exchange = {
  role: 'user' | 'assistant'
  text: string
  mode: AssistantMode
  response?: ChatResponse
}

/**
 * Assistant chat.
 *
 * Honesty rules (AGENTS.md):
 * - a `retrieval_only` answer is labelled **"Retrieval (no model)"** — never
 *   "generated", never "AI answer";
 * - the admin↔public switch only renders for an admin role, because the admin
 *   route is strict role + scope gated server-side;
 * - admin mode shows `provider`/`model` and the tool trace; public mode shows
 *   citations only.
 * - a caller can paste their own API key for **this request only**: it travels
 *   as `api_key` against the selected catalog row, is never stored server-side,
 *   and the client never sends a provider of its own — the target is always the
 *   server's catalog selection.
 */
export function Assistant() {
  const role = useRole()
  const isAdmin = can(role, 'admin')
  const [mode, setMode] = useState<AssistantMode>('public')
  const [message, setMessage] = useState('')
  // Per-request target chosen in the selector — sent as `provider`/`model`,
  // echoed back by the server as `requested_*` plus the `provider · model` used.
  const [selection, setSelection] = useState<ProviderSelection>({ provider: '', model: '' })
  // User-provided API key for the public assistant (not stored server-side).
  const [userApiKey, setUserApiKey] = useState('')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [history, setHistory] = useState<Exchange[]>([])
  const chat = useAssistantChat()
  // Catalog rows, for the honest key label — names come from the payload.
  const catalogItems = useProviderCatalog().data?.items ?? []
  // Single-flight guard: `chat.isPending` only flips on the next render, so a
  // second submit in the same tick would otherwise fire a second POST.
  const submitting = useRef(false)

  // A key pasted for one catalog row is not valid for another (different
  // base_url/adapter), so switching the target drops it rather than sending it
  // somewhere it does not belong.
  useEffect(() => {
    setUserApiKey('')
  }, [selection.provider])

  // The admin switch must not outlive the role it was enabled by (key cleared).
  const activeMode: AssistantMode = isAdmin ? mode : 'public'

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      const clean = message.trim()
      if (!clean || submitting.current || chat.isPending) return
      submitting.current = true
      chat.mutate(
        { message: clean, mode: activeMode, selection, userApiKey: userApiKey || undefined },
        {
          onSuccess: (response) => {
            setHistory((previous) => [
              ...previous,
              { role: 'user', text: clean, mode: activeMode },
              { role: 'assistant', text: response.answer, mode: activeMode, response },
            ])
            setMessage('')
          },
          onError: (error: unknown) =>
            toast.error('Chat failed', {
              description: error instanceof Error ? error.message : String(error),
            }),
          onSettled: () => {
            submitting.current = false
          },
        },
      )
    },
    [activeMode, chat, message, selection, userApiKey],
  )

  // Label the latest answer with the mode it was actually produced under —
  // the toggle only describes what the *next* send will use.
  const last = [...history].reverse().find((entry) => entry.role === 'assistant')

  // The pasted key is only ever used by the catalog row the selector is on, so
  // the label names that row — never a vendor chosen by the client.
  const selectedRow = catalogItems.find((item) => item.catalog_id === selection.provider)
  const apiKeyLabel = `API key for ${selectedRow?.name || selectedRow?.catalog_id || 'the selected provider'}`

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }, [])

  const handleFeedback = useCallback((_response: ChatResponse, score: 1 | -1) => {
    // No feedback endpoint exists yet — say so instead of thanking the user
    // for a send that never happened.
    toast.info(score === 1 ? 'Marked helpful — noted locally' : 'Marked not helpful — noted locally', {
      description: 'Feedback is not sent to the server yet — nothing was recorded.',
    })
  }, [])

  return (
    <div className="flex flex-col gap-5 h-full max-h-[calc(100vh-8rem)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <MessageSquareQuote className="size-5 text-primary" aria-hidden />
            Assistant
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Retrieval-grounded chat over the knowledge base. A catalog provider only answers with a
            model when an API key is in play — one configured for that catalog row on the server, or
            one you paste below. With no key the server answers honestly from retrieval: no model is
            called.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            <span className="text-xs font-medium">Admin mode</span>
            <Switch
              checked={mode === 'admin'}
              onCheckedChange={(next) => setMode(next ? 'admin' : 'public')}
              aria-label="Use the admin assistant route"
            />
          </div>
        )}
      </header>

      {!isAdmin && (
        <Alert>
          <ShieldCheck aria-hidden />
          <AlertTitle>Public assistant</AlertTitle>
          <AlertDescription>
            Posting to <span className="font-mono">/assistant/chat</span> — anonymous-safe in every
            auth mode, retrieval tools only. An admin key unlocks the admin route with the full
            tool set and trace. The selected catalog provider needs an API key to answer with a
            model — one configured server-side for that row, or one you paste below for this
            request only. With no key, the server answers from retrieval and says so.
          </AlertDescription>
        </Alert>
      )}

      <Card
        title="Message"
        subtitle={`POST ${activeMode === 'admin' ? '/admin/assistant/chat' : '/assistant/chat'}`}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <ProviderModelSelect
            value={selection}
            onChange={setSelection}
            idPrefix="assistant-target"
            disabled={chat.isPending}
          />

          {activeMode === 'public' && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-lg:h-10"
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              >
                {showApiKeyInput ? <Lock className="size-4" /> : <Key className="size-4" />}
                {showApiKeyInput ? 'Hide API key' : 'Use your own API key'}
              </Button>

              {showApiKeyInput && (
                <Field>
                  <FieldLabel htmlFor="assistant-api-key">{apiKeyLabel}</FieldLabel>
                  <Input
                    id="assistant-api-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={userApiKey}
                    onChange={(event) => setUserApiKey(event.target.value)}
                    placeholder="Paste your API key"
                    className="h-10 font-mono text-sm"
                  />
                  <FieldDescription>
                    Sent only with this request over HTTPS and never stored on the server. The
                    server calls the <strong>selected catalog provider</strong> with it — switching
                    the provider above clears the field, because a key for one vendor is not valid
                    for another.
                  </FieldDescription>
                </Field>
              )}
            </div>
          )}

          <Field>
            <FieldLabel htmlFor="assistant-message">Message</FieldLabel>
            <Textarea
              id="assistant-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask about a Zolai word, verse or grammar rule…"
              rows={3}
              className="min-h-20 resize-y"
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={!message.trim() || chat.isPending} className="h-10">
              <Send aria-hidden />
              {chat.isPending ? 'Thinking…' : 'Send'}
            </Button>
          </div>
        </form>
      </Card>

      {chat.isPending ? (
        <Card title="Answer" subtitle="pending">
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-5/6" />
            <span className="sr-only">Waiting for the assistant…</span>
          </div>
        </Card>
      ) : chat.isError ? (
        <ErrorState error={chat.error} compact />
      ) : !last?.response ? (
        <Empty
          title="No conversation yet"
          hint="Ask a question. Answers carry citations back to the corpus; without an active provider the server says so instead of inventing text."
        />
      ) : (
        <AnswerPanel response={last.response} mode={last.mode} onCopy={handleCopy} onFeedback={handleFeedback} />
      )}

      {history.length > 0 && (
        <Card title="Transcript" subtitle={`${history.length} messages`} tone="muted">
          <ol className="flex flex-col gap-3 max-h-96 overflow-y-auto">
            {history.map((entry, index) => (
              <li
                key={index}
                className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    entry.role === 'user'
                      ? 'max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm'
                      : 'max-w-[85%] rounded-lg border bg-muted/40 px-3 py-2 text-sm'
                  }
                >
                  <p className="mb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    {entry.role === 'user' ? 'You' : `Assistant · ${entry.mode}`}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  )
}

function AnswerPanel({ response, mode, onCopy, onFeedback }: { response: ChatResponse; mode: AssistantMode; onCopy: (text: string) => void; onFeedback: (response: ChatResponse, score: 1 | -1) => void }) {
  const retrievalOnly = response.retrieval_only
  const citations = response.citations ?? []

  return (
    <>
      <Card
        title={retrievalOnly ? 'Retrieval (no model)' : 'Answer'}
        subtitle={
          retrievalOnly
            ? 'retrieval_only: true — no active provider, answered from the corpus'
            : `${response.provider || 'provider unset'} · ${response.model || 'model unset'}`
        }
        tone={retrievalOnly ? 'muted' : 'accent'}
        actions={
          <>
            {retrievalOnly ? (
              <Badge variant="outline">retrieval_only</Badge>
            ) : (
              <Badge>generated</Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="max-lg:h-10"
              onClick={() => onCopy(response.answer)}
              aria-label="Copy answer"
            >
              <Copy className="size-4" aria-hidden />
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{response.answer}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            className="max-lg:h-10"
            onClick={() => onFeedback(response, 1)}
            aria-label="Helpful"
          >
            <ThumbsUp className="size-4" aria-hidden />
            Helpful
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="max-lg:h-10"
            onClick={() => onFeedback(response, -1)}
            aria-label="Not helpful"
          >
            <ThumbsDown className="size-4" aria-hidden />
            Not helpful
          </Button>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <div>
            <dt className="inline">Latency </dt>
            <dd className="inline font-mono">{formatCount(Math.round(response.latency_ms))} ms</dd>
          </div>
          <div>
            <dt className="inline">Turns </dt>
            <dd className="inline font-mono">{formatCount(response.turns)}</dd>
          </div>
          {(response.requested_provider || response.requested_model) !== '' && (
            <div>
              <dt className="inline">Requested </dt>
              <dd className="inline font-mono">
                {response.requested_provider || 'server default'}
                {response.requested_model ? ` · ${response.requested_model}` : ''}
              </dd>
            </div>
          )}
          {response.requested_api_key && (
            <div>
              <dt className="inline">Key </dt>
              <dd className="inline font-mono text-primary">user-provided</dd>
            </div>
          )}
          {response.requested_user_provider && (
            <div>
              <dt className="inline">Provider </dt>
              <dd className="inline font-mono text-primary">user-provided</dd>
            </div>
          )}
          {mode === 'admin' && (
            <div>
              <dt className="inline">Route </dt>
              <dd className="inline font-mono">/admin/assistant/chat</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="Citations" subtitle={`${citations.length} source${citations.length === 1 ? '' : 's'}`}>
        {citations.length === 0 ? (
          <Empty
            compact
            title="No citations"
            hint="The server returned no citable evidence for this message."
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {citations.map((citation, index) => (
              <li
                key={`${citation.source}-${citation.ref}-${index}`}
                className="rounded-lg border bg-muted/40 p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <Badge variant="secondary">{citation.source}</Badge>
                  {citation.ref && (
                    <span className="font-mono text-muted-foreground">{citation.ref}</span>
                  )}
                  {citation.score > 0 && (
                    <span className="ml-auto font-mono text-muted-foreground">
                      {formatScore(citation.score)}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed break-words">{citation.text}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {mode === 'admin' && (
        <Card
          title="Tool trace"
          subtitle={`${response.tool_calls.length} call${response.tool_calls.length === 1 ? '' : 's'} · admin inspector`}
          actions={<Wrench className="text-muted-foreground/70" aria-hidden />}
        >
          {response.tool_calls.length === 0 ? (
            <Empty
              compact
              title="No tool calls"
              hint="The model answered directly, or the run fell back before calling a tool."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {response.tool_calls.map((call, index) => (
                <li
                  key={`${call.name}-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs"
                >
                  <span className="font-mono font-medium">{call.name}</span>
                  <Badge variant={call.ok ? 'secondary' : 'destructive'}>
                    {call.status || (call.ok ? 'ok' : 'failed')}
                  </Badge>
                  <span className="ml-auto font-mono text-muted-foreground">
                    {formatCount(Math.round(call.latency_ms))} ms · turn {formatCount(call.turn)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  )
}
