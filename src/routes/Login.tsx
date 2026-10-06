import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, LogIn, ShieldCheck, UserCheck } from 'lucide-react'
import { useApiKey } from '../components/KeyDialog'
import { Card } from '../components/Card'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Field, FieldError, FieldLabel } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { submitApiKey } from '../lib/forms'
import { useAuthMe } from '../lib/auth'
import { DASHBOARD_PATH, pathOf, safeReturnPath } from '../lib/routes'
import { identitySummary } from '../lib/signIn'
import {
  signIn,
  signInTitle,
  signOut,
  verifyFailureNotice,
  type VerifyFailure,
} from '../lib/session'

/**
 * Sign in — and it is honest about what that means.
 *
 * The API has **no accounts and no login endpoint**: identity *is* an API key,
 * so this screen verifies a pasted key against the public `GET /auth/me` and
 * stores it only when the server recognises it. A rejected key is never written,
 * so a bad paste cannot clobber a working one.
 *
 * There is no session cookie to fake and no role to guess locally — the identity
 * panel below the form reads the same `/auth/me` payload the whole app gates on,
 * and a *stored* key the server does not recognise is reported as such instead of
 * being dressed up as a live session. The two failure modes are kept apart: a
 * key the API **refused** and an API that **never answered** need different
 * things from the reader, and neither is "login failed".
 *
 * This page is reachable from the top bar, the sidebar footer and ⌘K for every
 * role — see `src/lib/signIn.ts`.
 */
export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { hasKey, masked } = useApiKey()
  const me = useAuthMe()

  const [key, setKey] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [reason, setReason] = useState<VerifyFailure | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  // `?from=` is attacker-controllable, so it is validated before it can reach
  // `navigate()`: an absolute or protocol-relative URL would be an open redirect,
  // and a value carrying a newline would throw inside `pushState`.
  const from = safeReturnPath(params.get('from'))

  const submit = async () => {
    // Same schema the paste-key dialog uses: a blank submit never reaches the network.
    const validated = submitApiKey({ apiKey: key })
    if (!validated.ok) {
      setError(validated.issues[0] ?? 'Invalid API key.')
      setReason(undefined)
      return
    }
    setBusy(true)
    setError(undefined)
    setReason(undefined)
    try {
      const result = await signIn(validated.value)
      if (!result.ok) {
        setError(result.message)
        setReason(result.reason)
        return
      }
      setKey('')
      navigate(from, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const leave = () => {
    signOut()
    setError(undefined)
    navigate(from, { replace: true })
  }

  const notice = reason ? verifyFailureNotice(reason) : null
  // What the server says about the stored key *now* — never a local assumption.
  const identity = identitySummary({ role: me.role, keyPrefix: me.key_prefix, scopes: me.scopes }, hasKey)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <KeyRound className="size-5 text-primary" aria-hidden />
          {signInTitle(hasKey)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The Zolai Core API has no accounts: a key <em>is</em> the credential, and the server
          derives the role from its scopes. Paste a key and this screen asks the API who you are
          before it stores anything.
        </p>
      </header>

      <Card title="Verify the key" subtitle="GET /auth/me — public, never stores anything">
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field data-invalid={error ? 'true' : undefined}>
            <FieldLabel htmlFor="login-key">API key</FieldLabel>
            <Input
              id="login-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              aria-invalid={error ? 'true' : undefined}
              placeholder="paste API key"
              className="h-11 font-mono"
            />
            <FieldError>{error}</FieldError>
          </Field>

          {/* Two different problems, two different explanations: a refused key is
              not a transport failure, and neither is worth calling a generic
              "login failed". */}
          {notice && (
            <Alert variant={notice.tone === 'error' ? 'destructive' : 'default'}>
              {notice.tone === 'error' ? <KeyRound aria-hidden /> : <ShieldCheck aria-hidden />}
              <AlertTitle>{notice.title}</AlertTitle>
              <AlertDescription>{notice.body}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="max-lg:h-11" disabled={busy}>
              <LogIn aria-hidden />
              {busy ? 'Verifying…' : 'Verify and sign in'}
            </Button>
            {hasKey && (
              <Button
                type="button"
                variant="outline"
                className="max-lg:h-11"
                onClick={leave}
                disabled={busy}
              >
                Sign out
              </Button>
            )}
            <Button asChild variant="link" size="sm" className="h-auto max-lg:h-10 px-0">
              <Link to={DASHBOARD_PATH}>Back to dashboard</Link>
            </Button>
          </div>
        </form>

        {hasKey && (
          <p className="mt-4 text-xs text-muted-foreground">
            A key is stored in this browser (<code className="font-mono">{masked}</code>). Signing in
            replaces it; signing out removes it and clears every cached response.
          </p>
        )}
      </Card>

      {/* Who the server says you are. Silent when there is no key; a warning, not
          a success, when a stored key is not recognised. */}
      {identity.show && (
        <Card
          title={
            <span className="flex items-center gap-1.5">
              {identity.tone === 'ok' && <UserCheck className="size-4 text-primary" aria-hidden />}
              {identity.title}
            </span>
          }
          subtitle="Verified identity — read back from GET /auth/me"
          tone={identity.tone === 'ok' ? 'accent' : 'default'}
        >
          <div className="flex flex-col gap-3">
            <p
              className={
                identity.tone === 'ok'
                  ? 'flex flex-wrap items-center gap-2 text-sm'
                  : 'text-sm text-amber-700 dark:text-amber-300'
              }
            >
              {identity.tone === 'ok' && (
                <Badge variant={me.role === 'admin' ? 'default' : 'secondary'}>{me.role}</Badge>
              )}
              {identity.detail}
            </p>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                scopes ({identity.scopes.length})
              </span>
              {identity.scopes.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {identity.scopes.map((scope) => (
                    <li key={scope}>
                      <Badge variant="outline" className="font-mono">
                        {scope}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No scopes reported — the server grants nothing with this key.
                </p>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">{identity.source}</p>
          </div>
        </Card>
      )}

      <Card title="What a key unlocks" subtitle="the server decides — never this screen">
        <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
          <li>
            <Badge variant="outline" className="mr-1.5">
              anonymous
            </Badge>
            Public reads, `/health`, the public assistant.
          </li>
          <li>
            <Badge variant="secondary" className="mr-1.5">
              member
            </Badge>
            Agent runs and feedback (`agent:run` / `agent:read`).
          </li>
          <li>
            <Badge className="mr-1.5">admin</Badge>
            Provider catalog, key admin, admin assistant — any of{' '}
            <code className="font-mono">* apikey:manage settings:write user:manage role:manage</code>.
          </li>
          <li className="flex items-start gap-1.5 pt-1">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Keys are issued by an admin on{' '}
            <Link to={pathOf('settings')} className="underline">
              /settings
            </Link>{' '}
            (or the <code className="font-mono">zolai apikey</code> CLI for the first one). This app
            never mints one without an explicit action.
          </li>
        </ul>
      </Card>
    </div>
  )
}
