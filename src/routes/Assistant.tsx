import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  MessageSquareQuote,
  Send,
  ShieldCheck,
  Wrench,
  Key,
  Lock,
  Copy,
  ThumbsUp,
  ThumbsDown,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAssistantChat, type AssistantMode } from '../features/assistant/api'
import { useProviderCatalog } from '../features/providers/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { describeError, ErrorState, failureDetail } from '../components/ErrorState'
import { MetaList, type MetaItem } from '../components/MetaList'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { ProviderModelSelect } from '../components/ProviderModelSelect'
import { Skeleton } from '../components/Skeleton'
import { ToolCallList } from '../components/ToolCallList'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'
import { Field, FieldDescription, FieldLabel } from '../components/ui/field'
import { can, useRole } from '../lib/auth'
import { formatCount, formatScore } from '../lib/format'
import { apiPost } from '../lib/api'
import { documentedPath, endpointPath } from '../lib/endpoints'
import type { ChatResponse, ProviderSelection } from '../lib/schemas'

type Exchange = {
  role: 'user' | 'assistant'
  text: string
  mode: AssistantMode
  response?: ChatResponse
}

/**
 * Toast copy for a failed request.
 *
 * `String(error)` from network internals ("Failed to fetch", a raw AbortError)
 * tells a user nothing about what to do, so the toast takes the exact
 * classification the panel surface renders — one taxonomy, exported from
 * `ErrorState`. Only the *title* of a plain HTTP failure is the route's own
 * ("Message failed to send"), because "Request failed (HTTP 500)" says nothing
 * about what the user was doing.
 */
function toastFailure(error: unknown, fallbackTitle: string): { title: string; description?: string } {
  const d = describeError(error)
  // Branch on the classifier's stable `code`, not its prose — rewording
  // "Request failed (HTTP …)" must not silently change which title the toast
  // carries.
  const plainHttp = d.code === 'http'
  return {
    title: plainHttp ? fallbackTitle : d.title,
    description: failureDetail(error),
  }
}

/**
 * Assistant chat.
 *
 * The composer comes **first** and stands on its own: a message plus Send is the
 * whole contract, and it works for an anonymous visitor. No key, no provider
 * picker, no setup — the server answers with whichever AI provider the operator
 * configured on the server, and labels the answer with it.
 *
 * Everything that overrides that default lives behind one disclosure:
 *   - **provider · model** — travel in the request body; the answer reports the
 *     provider · model the server *actually* used, so an override that silently
 *     failed is visible rather than hidden;
 *   - **own API key** — used for this request only, never stored server-side.
 *     It is meaningless without a target row (a key for one vendor is not valid
 *     against another row's base_url), so it stays disabled until one is picked.
 *
 * Honesty rules (AGENTS.md):
 * - a `retrieval_only` answer is labelled **"Retrieval (no model)"** — never
 *   "generated", never "AI answer" — and when the server also set
 *   `generation_requires_auth` it says **"Retrieval (anonymous request)"**
 *   instead: a credential was what the request lacked, and the deployment may
 *   also have no provider — so the copy names the gate, never promises that
 *   signing in will produce a generated answer;
 * - the provider/model line names what the payload reports, and renders `—` for
 *   a provider or model the payload did not carry — the copy never promises that
 *   every answer arrives labelled;
 * - the admin↔public switch renders only for an admin role, because the admin
 *   route is strict role + scope gated server-side;
 * - tool calls are shown for **both** modes: the public route runs the
 *   retrieval tools too, and a trace that appears only after signing in makes
 *   those calls invisible to the visitor who asked the question. Admin mode
 *   names its card as the inspector; the rows are the same component the run
 *   page uses (arguments, result, error), so the two traces cannot drift.
 *
 * Structure: the answer panel has **one frame**. Pending, failed, nothing-asked
 * and an answered exchange all render inside the same `Card` with the same
 * header vocabulary, so the panel cannot change shape as the request moves
 * through its states.
 */
export function Assistant() {
  const role = useRole()
  const isAdmin = can(role, 'admin')
  const [mode, setMode] = useState<AssistantMode>('public')
  const [message, setMessage] = useState('')
  // Optional per-request target; empty means "no override" so the server keeps
  // resolving its own configured provider.
  const [selection, setSelection] = useState<ProviderSelection>({ provider: '', model: '' })
  const [showAdvanced, setShowAdvanced] = useState(false)
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
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  // A key pasted for one catalog row is not valid for another (different
  // base_url/adapter), so switching the target drops it rather than sending it
  // somewhere it does not belong. With no target at all the control is disabled
  // ("choose the provider your key belongs to first"), so collapse it too.
  useEffect(() => {
    setUserApiKey('')
    if (selection.provider === '') setShowApiKeyInput(false)
  }, [selection.provider])

  // The admin switch must not outlive the role it was enabled by (key cleared).
  const activeMode: AssistantMode = isAdmin ? mode : 'public'

  // The own-key panel is public-only: dropping into admin mode must not leave a
  // pasted key travelling on admin-route requests.
  useEffect(() => {
    if (activeMode === 'admin') {
      setUserApiKey('')
      setShowApiKeyInput(false)
    }
  }, [activeMode])

  const send = useCallback(
    (text: string) => {
      const clean = text.trim()
      if (!clean || submitting.current || chat.isPending) return
      submitting.current = true
      chat.mutate(
        {
          message: clean,
          mode: activeMode,
          selection,
          // Public-only: never carry a pasted key onto the admin route.
          userApiKey: activeMode === 'public' ? userApiKey || undefined : undefined,
        },
        {
          onSuccess: (response) => {
            setHistory((previous) => [
              ...previous,
              { role: 'user', text: clean, mode: activeMode },
              { role: 'assistant', text: response.answer, mode: activeMode, response },
            ])
            setMessage('')
          },
          onError: (error: unknown) => {
            const failure = toastFailure(error, 'Chat failed')
            toast.error(failure.title, { description: failure.description })
          },
          onSettled: () => {
            submitting.current = false
            // Return focus to the composer so the next question is one keystroke away.
            composerRef.current?.focus()
          },
        },
      )
    },
    [activeMode, chat, selection, userApiKey],
  )

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      send(message)
    },
    [message, send],
  )

  // Enter sends, Shift+Enter breaks the line — the chat convention. A modifier
  // or a held Shift is a newline, never a send.
  const onComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.nativeEvent.isComposing)
        return
      event.preventDefault()
      send(message)
    },
    [message, send],
  )

  // The answered exchange the frame shows, with the question it answered (the
  // feedback POST needs it) and the mode it was produced under — the toggle only
  // describes what the *next* send will use.
  const lastAnswerIndex = history.reduce(
    (found, entry, index) => (entry.role === 'assistant' && entry.response ? index : found),
    -1,
  )
  const lastExchange = lastAnswerIndex < 0 ? undefined : history[lastAnswerIndex]
  const lastQuestion =
    lastAnswerIndex <= 0 || history[lastAnswerIndex - 1]?.role !== 'user'
      ? ''
      : (history[lastAnswerIndex - 1]?.text ?? '')
  // A pending or failed send has no answer to show: the frame carries that state
  // instead, and the transcript below keeps whatever was answered before it.
  const response = chat.isPending || chat.isError ? undefined : lastExchange?.response
  const answeredMode: AssistantMode = lastExchange?.mode ?? activeMode
  const retrievalOnly = response?.retrieval_only === true
  const authGated = response?.generation_requires_auth === true
  const frame = answerFrameCopy(response, chat.isPending, chat.isError)

  // The pasted key is only ever used by the catalog row the selector is on, so
  // the label names that row — never a vendor chosen by the client.
  const selectedRow = catalogItems.find((item) => item.catalog_id === selection.provider)
  const apiKeyLabel = `API key for ${selectedRow?.name || selectedRow?.catalog_id || 'the selected provider'}`

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }, [])

  const handleFeedback = useCallback(async (response: ChatResponse, userMessage: string, score: 1 | -1) => {
    if (!userMessage) {
      toast.error('Feedback failed', { description: 'Could not determine original question' })
      return
    }
    try {
      await apiPost(
        endpointPath('assistant.feedback'),
        {
          message: userMessage,
          response: response.answer,
          mode: response.mode || 'public',
          retrieval_only: response.retrieval_only,
          provider: response.provider,
          model: response.model,
          score,
        }
      )
      toast.success(score === 1 ? 'Thanks for the feedback!' : 'Feedback recorded')
    } catch (error) {
      const failure = toastFailure(error, 'Feedback failed')
      toast.error(failure.title, { description: failure.description })
    }
  }, [])

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Assistant"
        icon={<MessageSquareQuote className="size-5" aria-hidden />}
        description={
          <>
            {/* The composer is the page, so nothing above it may push it off a
                phone screen. The long provenance explanation waits for `sm`. */}
            Retrieval-grounded chat over the knowledge base. Type a question and send.
            <span className="hidden sm:inline">
              {' '}
              The AI provider configured for this deployment answers it, with citations back to the
              corpus. When the payload reports the provider and model that wrote an answer this panel
              names them; when it does not, it says so instead of inventing a label.
            </span>
          </>
        }
        actions={
          isAdmin ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              <span className="text-xs font-medium">Admin mode</span>
              <Switch
                checked={mode === 'admin'}
                onCheckedChange={(next) => setMode(next ? 'admin' : 'public')}
                aria-label="Use the admin assistant route"
              />
            </div>
          ) : undefined
        }
      />

      {!isAdmin && (
        <Notice tone="info" title="Public assistant" icon={<ShieldCheck className="size-4" aria-hidden />}>
          Anonymous-safe in every auth mode — no key needed, the server answers with the AI provider
          configured on it.
          <span className="hidden sm:inline">
            {' '}
            Posting to <span className="font-mono">{documentedPath('assistant.chat.public')}</span>.
            An admin key additionally unlocks{' '}
            <span className="font-mono">{documentedPath('assistant.chat.admin')}</span> with the full
            tool set and trace.
          </span>
        </Notice>
      )}

      {/* The composer is the page. Provider overrides live inside it, collapsed. */}
      <Card
        title="Chat"
        subtitle={`POST ${documentedPath(activeMode === 'admin' ? 'assistant.chat.admin' : 'assistant.chat.public')}`}
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="assistant-message">Message</FieldLabel>
            <Textarea
              id="assistant-message"
              ref={composerRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Ask about a Zolai word, verse or grammar rule…"
              rows={3}
              className="min-h-24 resize-y"
            />
            <FieldDescription>
              <kbd className="font-mono">Enter</kbd> sends ·{' '}
              <kbd className="font-mono">Shift</kbd> + <kbd className="font-mono">Enter</kbd> adds
              a line
            </FieldDescription>
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!message.trim() || chat.isPending} className="h-10">
              <Send aria-hidden />
              {chat.isPending ? 'Thinking…' : 'Send'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-lg:h-10"
              aria-expanded={showAdvanced}
              aria-controls="assistant-advanced"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {showAdvanced ? 'Hide options' : 'Provider options'}
            </Button>

            {selection.provider !== '' && (
              <Badge variant="secondary" className="ml-auto">
                Override: {selectedRow?.name || selection.provider}
              </Badge>
            )}
          </div>

          {showAdvanced && (
            <div
              id="assistant-advanced"
              className="flex flex-col gap-4 rounded-lg border border-dashed bg-muted/30 p-3"
            >
              <p className="text-xs text-muted-foreground">
                Optional. Leave both unset and the server keeps using the provider configured on it
                — this only changes <em>which</em> provider answers.
              </p>

              <ProviderModelSelect
                value={selection}
                onChange={setSelection}
                idPrefix="assistant-target"
                disabled={chat.isPending}
              />

              {activeMode === 'public' && (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="max-lg:h-10 self-start"
                    disabled={selection.provider === ''}
                    onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                  >
                    {showApiKeyInput ? <Lock className="size-4" /> : <Key className="size-4" />}
                    {showApiKeyInput ? 'Hide API key' : 'Use your own API key'}
                  </Button>

                  {selection.provider === '' && (
                    <p className="text-[11px] text-muted-foreground">
                      Pick a provider above first — your key is used against that catalog row&apos;s
                      base URL, so it cannot be entered before a target is selected.
                    </p>
                  )}

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
                        Sent only with this request over HTTPS and never stored on the server. It
                        replaces the server&apos;s configured key for the selected row — switching
                        the provider clears the field, because a key for one vendor is not valid for
                        another.
                      </FieldDescription>
                    </Field>
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      </Card>

      {/* The answer frame: one Card for all four states, so the panel does not
          change shape as the request moves from waiting to answered. */}
      <Card
        title={frame.title}
        subtitle={frame.subtitle}
        tone={response !== undefined && !retrievalOnly ? 'accent' : 'muted'}
        actions={
          response ? (
            <>
              {retrievalOnly ? (
                <Badge variant="outline">retrieval_only</Badge>
              ) : (
                <Badge>generated</Badge>
              )}
              {authGated && <Badge variant="secondary">sign-in required</Badge>}
              <Button
                variant="ghost"
                size="sm"
                className="max-lg:h-10"
                onClick={() => handleCopy(response.answer)}
                aria-label="Copy answer"
              >
                <Copy className="size-4" aria-hidden />
              </Button>
            </>
          ) : undefined
        }
      >
        {response ? (
          <AnswerBody
            response={response}
            mode={answeredMode}
            userMessage={lastQuestion}
            onFeedback={handleFeedback}
          />
        ) : chat.isPending ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-5/6" />
            {/* No fake progress: the honest fact is the budget, not a countdown. */}
            <p className="text-[11px] text-muted-foreground">
              A free-tier provider answer can take up to ~60s — there is nothing to show until the
              server replies.
            </p>
            <span className="sr-only">Waiting for the assistant…</span>
          </div>
        ) : chat.isError ? (
          <ErrorState
            error={chat.error}
            compact
            // Retry only when there is still a message to retry — the composer
            // keeps its text on a failure, so this re-sends exactly what failed.
            onRetry={message.trim() === '' ? undefined : () => send(message)}
          />
        ) : (
          <Empty
            compact
            title="No conversation yet"
            hint="Ask a question in the box above. Answers carry citations back to the corpus; when the server reports the model that wrote an answer this panel names it, and when no model wrote it the card says so — retrieval, never generated text — naming whether a credential or a provider was missing."
          />
        )}
      </Card>

      {response && <CitationsPanel citations={response.citations ?? []} />}

      {response && <ToolsPanel calls={response.tool_calls} mode={answeredMode} />}

      {history.length > 0 && (
        <Card title="Transcript" subtitle={`${history.length} messages`} tone="muted">
          <ol className="flex max-h-96 flex-col gap-3 overflow-y-auto">
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
                  <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                    {entry.role === 'user' ? 'You' : `Assistant · ${entry.mode}`}
                  </p>
                  <p className="break-words whitespace-pre-wrap">{entry.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  )
}

/**
 * Copy for the answer frame's header, kept pure so the honesty rules are
 * pinned without a DOM.
 *
 * A `retrieval_only` answer is never "generated". And `generation_requires_auth`
 * means *a credential was missing* — the server sets it on any anonymous
 * request, whether or not the deployment also has a provider. So the frame
 * names the anonymous gate without promising that signing in will generate;
 * "no active provider" is reserved for the flag-absent case, where signing in
 * genuinely would not help.
 */
export function answerFrameCopy(
  response: ChatResponse | undefined,
  pending: boolean,
  failed: boolean,
): { title: string; subtitle: string } {
  if (!response) {
    return {
      title: 'Answer',
      subtitle: pending
        ? 'waiting for the server'
        : failed
          ? 'the last request did not complete'
          : 'no question sent yet',
    }
  }
  if (response.retrieval_only) {
    return response.generation_requires_auth
      ? {
          // The flag means *a credential was missing*, not "signing in will
          // generate": the deployment may also have no provider. So the copy
          // names the gate without promising the provider.
          title: 'Retrieval (anonymous request)',
          subtitle:
            'retrieval_only: true — anonymous request; generation needs a signed-in credential',
        }
      : {
          title: 'Retrieval (no model)',
          subtitle: 'retrieval_only: true — no active provider, answered from the corpus',
        }
  }
  return {
    title: 'Answer',
    subtitle: `${response.provider || '—'} · ${response.model || '—'}`,
  }
}

/**
 * Body of the answer frame — the prose, the feedback controls, and only the
 * facts the payload actually carries. The `Card` itself lives in `Assistant`,
 * so loading / error / empty / answer all share one frame.
 */
function AnswerBody({
  response,
  mode,
  userMessage,
  onFeedback,
}: {
  response: ChatResponse
  mode: AssistantMode
  userMessage: string
  onFeedback: (response: ChatResponse, userMessage: string, score: 1 | -1) => void
}) {
  const meta: MetaItem[] = [
    { label: 'Latency', value: `${formatCount(Math.round(response.latency_ms))} ms` },
    { label: 'Turns', value: formatCount(response.turns) },
    // What the caller *asked* for travels apart from what answered; an override
    // that was never sent is not a fact worth a row.
    ...(response.requested_provider !== '' || response.requested_model !== ''
      ? [
          {
            label: 'Requested',
            value: `${response.requested_provider || 'server default'}${
              response.requested_model ? ` · ${response.requested_model}` : ''
            }`,
          },
        ]
      : []),
    ...(response.requested_api_key ? [{ label: 'Key', value: 'user-provided' }] : []),
    ...(mode === 'admin' ? [{ label: 'Route', value: documentedPath('assistant.chat.admin') }] : []),
  ]

  return (
    <>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{response.answer}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="max-lg:h-10"
          onClick={() => onFeedback(response, userMessage, 1)}
          aria-label="Helpful"
        >
          <ThumbsUp className="size-4" aria-hidden />
          Helpful
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="max-lg:h-10"
          onClick={() => onFeedback(response, userMessage, -1)}
          aria-label="Not helpful"
        >
          <ThumbsDown className="size-4" aria-hidden />
          Not helpful
        </Button>
      </div>
      <MetaList items={meta} className="mt-3" />
    </>
  )
}

/** Citations — the same Card vocabulary as the answer frame, empty is still labelled. */
function CitationsPanel({ citations }: { citations: ChatResponse['citations'] }) {
  return (
    <Card
      title="Citations"
      subtitle={`${citations.length} source${citations.length === 1 ? '' : 's'} named by the server`}
    >
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
              <p className="break-words text-xs leading-relaxed">{citation.text}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

/**
 * Tool calls made on the way to the answer. Every call is rendered by the
 * shared `ToolCallList` — name, arguments, status, latency, turn, and the
 * result or error. Public callers see the same rows under a plainer title; the
 * admin route additionally runs the admin tool set, which its title names.
 */
export function ToolsPanel({
  calls,
  mode,
}: {
  calls: ChatResponse['tool_calls']
  mode: AssistantMode
}) {
  const admin = mode === 'admin'
  return (
    <Card
      title={admin ? 'Tool trace' : 'Tools used'}
      subtitle={`${calls.length} call${calls.length === 1 ? '' : 's'}${
        admin ? ' · admin inspector' : ' · run by the assistant'
      }`}
      actions={<Wrench className="text-muted-foreground/70" aria-hidden />}
    >
      <ToolCallList calls={calls} />
    </Card>
  )
}
