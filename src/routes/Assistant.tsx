import { useCallback, useState, type FormEvent } from 'react'
import { MessageSquareQuote, Send, ShieldCheck, Wrench, Key, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useAssistantChat, type AssistantMode } from '../features/assistant/api'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
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
 * - users can provide their own API key for the public assistant to use their
 *   own provider (OpenAI, OpenRouter, etc.) without server-side storage.
 */
export function Assistant() {
  const role = useRole()
  const isAdmin = can(role, 'admin')
  const [mode, setMode] = useState<AssistantMode>('public')
  const [message, setMessage] = useState('')
  // Per-request target chosen in the selector — sent as `provider`/`model`,
  // echoed back by the server as `requested_*` plus the `provider · model` used.
  const [selection, setSelection] = useState<ProviderSelection>({ provider: '', model: '' })
  // User-provided API key for the public assistant (not stored server-side)
  const [userApiKey, setUserApiKey] = useState('')
  const [userProvider, setUserProvider] = useState('openai')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [history, setHistory] = useState<Exchange[]>([])
  const chat = useAssistantChat()

  // The admin switch must not outlive the role it was enabled by (key cleared).
  const activeMode: AssistantMode = isAdmin ? mode : 'public'

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      const clean = message.trim()
      if (!clean || chat.isPending) return
      chat.mutate(
        { message: clean, mode: activeMode, selection, userApiKey: userApiKey || undefined, userProvider: userProvider || undefined },
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
        },
      )
    },
    [activeMode, chat, message, selection, userApiKey, userProvider],
  )

  // Label the latest answer with the mode it was actually produced under —
  // the toggle only describes what the *next* send will use.
  const last = [...history].reverse().find((entry) => entry.role === 'assistant')

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <MessageSquareQuote className="size-5 text-primary" aria-hidden />
            Assistant
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Retrieval-grounded chat over the knowledge base. With no active provider the server
            answers honestly from retrieval — no model is called. Add your own API key to use a model.
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
            tool set and trace. Provide your own API key below to enable model generation.
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
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">Provider (for your key)</label>
                      <Select value={userProvider} onValueChange={setUserProvider}>
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue placeholder="Select provider…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="openrouter">OpenRouter</SelectItem>
                          <SelectItem value="gemini">Gemini</SelectItem>
                          <SelectItem value="custom">Custom (OpenAI-compatible)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Model</label>
                      <Input
                        type="text"
                        placeholder="your model id (e.g. from the provider's model list)"
                        className="h-10 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <Input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={userApiKey}
                      onChange={(e) => setUserApiKey(e.target.value)}
                      placeholder="Paste your API key (sk-..., or your provider's key format)"
                      className="h-10 font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your key is sent only with this request over HTTPS. It is not stored on the server.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask about a Zolai word, verse or grammar rule…"
            rows={3}
            className="min-h-20 resize-y"
            aria-label="Message for the assistant"
          />
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
        <AnswerPanel response={last.response} mode={last.mode} />
      )}

      {history.length > 0 && (
        <Card title="Transcript" subtitle={`${history.length} messages`} tone="muted">
          <ol className="flex flex-col gap-3">
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

function AnswerPanel({ response, mode }: { response: ChatResponse; mode: AssistantMode }) {
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
          retrievalOnly ? (
            <Badge variant="outline">retrieval_only</Badge>
          ) : (
            <Badge>generated</Badge>
          )
        }
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{response.answer}</p>
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
