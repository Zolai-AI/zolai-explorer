import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, LogIn, ShieldCheck, UserCheck, RotateCcw } from 'lucide-react'
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
  signInWithPassword,
  signOutSession,
  verifyFailureNotice,
  passwordVerifyFailureNotice,
  type VerifyFailure,
  type PasswordVerifyFailure,
} from '../lib/session'

/**
 * Sign in — and it is honest about what that means.
 *
 * The Zolai Core API now supports **two** credential paths:
 *   1. **API key** (original): verify-then-store against `GET /auth/me`, stored in
 *      `localStorage` as `zolai.apiKey`, sent as `X-API-Key`.
 *   2. **Username + password** (new): `POST /auth/login` returns a short-lived
 *      session token stored in `sessionStorage` as `zolai.session`, sent as
 *      `Authorization: Bearer <token>`. On success the stored API key is **cleared**
 *      (one active credential). Sign-out calls `POST /auth/logout` (best-effort) then
 *      clears the session.
 *
 * There are no accounts in the traditional sense — identity is still derived from
 * the credential the server recognises. The two failure modes are kept apart for
 * each path: a credential the API **refused** vs an API that **never answered**.
 *
 * This page is reachable from the top bar, the sidebar footer and ⌘K for every
 * role — see `src/lib/signIn.ts`.
 */
export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { hasKey, masked } = useApiKey()
  const me = useAuthMe()

  // API key form state
  const [key, setKey] = useState('')
  const [keyError, setKeyError] = useState<string | undefined>(undefined)
  const [keyReason, setKeyReason] = useState<VerifyFailure | undefined>(undefined)
  const [keyBusy, setKeyBusy] = useState(false)

  // Password form state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pwdError, setPwdError] = useState<string | undefined>(undefined)
  const [pwdReason, setPwdReason] = useState<PasswordVerifyFailure | undefined>(undefined)
  const [pwdBusy, setPwdBusy] = useState(false)

  // Toggle between the two cards
  const [mode, setMode] = useState<'api-key' | 'password'>('api-key')

  // `?from=` is attacker-controllable, so it is validated before it can reach
  // `navigate()`: an absolute or protocol-relative URL would be an open redirect,
  // and a value carrying a newline would throw inside `pushState`.
  const from = safeReturnPath(params.get('from'))

  const submitKey = async () => {
    const validated = submitApiKey({ apiKey: key })
    if (!validated.ok) {
      setKeyError(validated.issues[0] ?? 'Invalid API key.')
      setKeyReason(undefined)
      return
    }
    setKeyBusy(true)
    setKeyError(undefined)
    setKeyReason(undefined)
    try {
      const result = await signIn(validated.value)
      if (!result.ok) {
        setKeyError(result.message)
        setKeyReason(result.reason)
        return
      }
      setKey('')
      navigate(from, { replace: true })
    } finally {
      setKeyBusy(false)
    }
  }

  const submitPassword = async () => {
    const user = username.trim()
    const pass = password.trim()
    if (!user || !pass) {
      setPwdError('Enter both username and password — nothing was sent.')
      setPwdReason('blank')
      return
    }
    setPwdBusy(true)
    setPwdError(undefined)
    setPwdReason(undefined)
    try {
      const result = await signInWithPassword(user, pass)
      if (!result.ok) {
        setPwdError(result.message)
        setPwdReason(result.reason)
        return
      }
      setUsername('')
      setPassword('')
      navigate(from, { replace: true })
    } finally {
      setPwdBusy(false)
    }
  }

  const leaveKey = () => {
    signOut()
    setKeyError(undefined)
    navigate(from, { replace: true })
  }

  const leaveSession = async () => {
    await signOutSession()
    navigate(from, { replace: true })
  }

  const keyNotice = keyReason ? verifyFailureNotice(keyReason) : null
  const pwdNotice = pwdReason ? passwordVerifyFailureNotice(pwdReason) : null

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

      {/* Card 1: API Key verification (original flow) */}
      <Card title="Verify the key" subtitle="GET /auth/me — public, never stores anything">
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submitKey()
          }}
        >
          <Field data-invalid={keyError ? 'true' : undefined}>
            <FieldLabel htmlFor="login-key">API key</FieldLabel>
            <Input
              id="login-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              aria-invalid={keyError ? 'true' : undefined}
              placeholder="paste API key"
              className="h-11 font-mono"
            />
            <FieldError>{keyError}</FieldError>
          </Field>

          {/* Two different problems, two different explanations: a refused key is
              not a transport failure, and neither is worth calling a generic
              "login failed". */}
          {keyNotice && (
            <Alert variant={keyNotice.tone === 'error' ? 'destructive' : 'default'}>
              {keyNotice.tone === 'error' ? <KeyRound aria-hidden /> : <ShieldCheck aria-hidden />}
              <AlertTitle>{keyNotice.title}</AlertTitle>
              <AlertDescription>{keyNotice.body}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="max-lg:h-11" disabled={keyBusy}>
              <LogIn aria-hidden />
              {keyBusy ? 'Verifying…' : 'Verify and sign in'}
            </Button>
            {hasKey && (
              <Button
                type="button"
                variant="outline"
                className="max-lg:h-11"
                onClick={leaveKey}
                disabled={keyBusy}
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

        {/* Toggle to password form */}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-2 h-auto max-lg:h-10 px-0"
          onClick={() => setMode('password')}
        >
          <RotateCcw className="size-4 mr-1.5" aria-hidden />
          Use username & password instead
        </Button>
      </Card>

      {/* Card 2: Username + Password form (new session flow) */}
      {mode === 'password' && (
        <Card
          title="Sign in with username & password"
          subtitle="POST /auth/login — returns a session token (Bearer), clears stored API key"
        >
          <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submitPassword()
            }}
          >
            <Field data-invalid={pwdError ? 'true' : undefined}>
              <FieldLabel htmlFor="login-username">Username</FieldLabel>
              <Input
                id="login-username"
                type="text"
                autoComplete="username"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-invalid={pwdError ? 'true' : undefined}
                placeholder="username"
                className="h-11"
              />
              <FieldError>{pwdError}</FieldError>
            </Field>

            <Field data-invalid={pwdError ? 'true' : undefined}>
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={pwdError ? 'true' : undefined}
                placeholder="password"
                className="h-11"
              />
              <FieldError>{pwdError}</FieldError>
            </Field>

            {pwdNotice && (
              <Alert variant={pwdNotice.tone === 'error' ? 'destructive' : 'default'}>
                {pwdNotice.tone === 'error' ? <KeyRound aria-hidden /> : <ShieldCheck aria-hidden />}
                <AlertTitle>{pwdNotice.title}</AlertTitle>
                <AlertDescription>{pwdNotice.body}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" className="max-lg:h-11" disabled={pwdBusy}>
                <LogIn aria-hidden />
                {pwdBusy ? 'Signing in…' : 'Sign in'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="max-lg:h-11"
                onClick={leaveSession}
                disabled={pwdBusy}
              >
                Sign out
              </Button>
              <Button asChild variant="link" size="sm" className="h-auto max-lg:h-10 px-0">
                <Link to={DASHBOARD_PATH}>Back to dashboard</Link>
              </Button>
            </div>
          </form>

          {/* Toggle back to API key form */}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto max-lg:h-10 px-0"
            onClick={() => setMode('api-key')}
          >
            <RotateCcw className="size-4 mr-1.5" aria-hidden />
            Use an API key instead
          </Button>
        </Card>
      )}

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