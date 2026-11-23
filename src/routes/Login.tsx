import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, LogIn, ShieldCheck, UserCheck, Eye, EyeOff } from 'lucide-react'
import { useApiKey } from '../components/KeyDialog'
import { Card } from '../components/Card'
import { Notice } from '../components/Notice'
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
  type SignInSurface,
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
 *      (one active credential), and signing in with a key symmetrically ends the
 *      session — a key stored underneath a live session would never be sent.
 *      Sign-out calls `POST /auth/logout` (best-effort) then clears the session.
 *
 * The card on screen is the one an operator needs, not both stacked: the mode
 * toggle swaps them, and each offers only the sign-out its own credential can
 * actually end. An account is a username an admin created; a key is the older
 * credential, and both are resolved to a role by the server rather than by this
 * screen. The two failure modes are kept apart for each path: a credential the
 * API **refused** vs an API that **never answered**.
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
  const [keyVisible, setKeyVisible] = useState(false)

  // Password form state.
  //
  // `pwdFieldErrors` holds the per-input validation (which field is missing),
  // because a single string rendered under *both* inputs told a screen-reader
  // user nothing about which one to fix. A credential the server refused is not
  // one input's problem, so it never becomes a field error — the notice below
  // owns it, with the two failure modes kept apart.
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pwdFieldErrors, setPwdFieldErrors] = useState<{ username?: string; password?: string }>(
    {},
  )
  const [pwdReason, setPwdReason] = useState<PasswordVerifyFailure | undefined>(undefined)
  const [pwdBusy, setPwdBusy] = useState(false)
  const [pwdVisible, setPwdVisible] = useState(false)

  // Toggle between the two cards
  // The password card leads: it is the credential an operator actually holds.
  // The API-key card stays one click away for a key issued by an admin.
  const [mode, setMode] = useState<SignInSurface>('password')

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
    const missing: { username?: string; password?: string } = {}
    if (user === '') missing.username = 'Enter a username.'
    if (pass === '') missing.password = 'Enter a password.'
    if (missing.username || missing.password) {
      setPwdFieldErrors(missing)
      setPwdReason('blank')
      return
    }
    setPwdBusy(true)
    setPwdFieldErrors({})
    setPwdReason(undefined)
    try {
      const result = await signInWithPassword(user, pass)
      if (!result.ok) {
        // The reason and its explanation come from `passwordVerifyFailureNotice`
        // below — a refused credential names neither input.
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

  // The key card offers this only while the key is the credential in play (see
  // `canLeaveKey`), so `signOut()` takes its key branch and not the session one.
  const leaveKey = () => {
    void signOut()
    setKeyError(undefined)
    navigate(from, { replace: true })
  }

  const leaveSession = async () => {
    await signOutSession()
    navigate(from, { replace: true })
  }

  const keyNotice = keyReason ? verifyFailureNotice(keyReason) : null
  const pwdNotice = pwdReason ? passwordVerifyFailureNotice(pwdReason) : null

  // What the server says about the credential *now* — never a local assumption.
  const identity = identitySummary(
    { role: me.role, keyPrefix: me.key_prefix, scopes: me.scopes, authSource: me.auth_source, username: me.username },
    hasKey,
  )

  // Pressing **Sign out** on the key card ends what the *server* says is active,
  // not what happens to be in `localStorage`. It appears for a recognised key,
  // and for a stored key the server refuses — the warn state's only way out —
  // but never while a session is the credential being sent. Gating this on
  // `hasKey` alone offered a key-card button that ended a session instead.
  const canLeaveKey =
    me.auth_source === 'api_key' || (hasKey && me.auth_source !== 'session')

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <KeyRound className="size-5 text-primary" aria-hidden />
          {signInTitle(mode, hasKey)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'password'
            ? 'Sign in with the username and password an admin created for you. The server returns a session token for this browser tab only; the role comes from your scopes, never from this screen.'
            : 'A key is the other credential: the server derives your role from its scopes, never from this screen. Paste one and this page asks the API who you are before it stores anything.'}
        </p>
      </header>

      {/* Card 1: API Key verification — only while this surface is on screen. */}
      {mode === 'api-key' && (
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
            {/* The error is a sibling of the wrapper, not a child of it: inside
                the `relative` box it also stretched the box, so the absolutely
                centred eye toggle slid down off the input. */}
            <div className="relative">
              <Input
                id="login-key"
                type={keyVisible ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(event) => {
                  setKey(event.target.value)
                  if (keyError) setKeyError(undefined)
                }}
                aria-invalid={keyError ? 'true' : undefined}
                aria-describedby={keyError ? 'login-key-error' : undefined}
                placeholder="paste API key"
                className="h-11 font-mono pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 max-lg:size-10"
                onClick={() => setKeyVisible(!keyVisible)}
                aria-label={keyVisible ? 'Hide key' : 'Show key'}
                aria-pressed={keyVisible}
              >
                {keyVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <FieldError id="login-key-error">{keyError}</FieldError>
          </Field>

          {/* Two different problems, two different explanations: a refused key is
              not a transport failure, and neither is worth calling a generic
              "login failed". `danger` for a refused credential, `warning` for a
              probe that never answered. */}
          {keyNotice && (
            <Notice
              tone={keyNotice.tone === 'error' ? 'danger' : 'warning'}
              icon={keyNotice.tone === 'error' ? <KeyRound /> : <ShieldCheck />}
              title={keyNotice.title}
            >
              {keyNotice.body}
            </Notice>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="max-lg:h-11" disabled={keyBusy}>
              <LogIn aria-hidden />
              {keyBusy ? 'Verifying…' : 'Verify and sign in'}
            </Button>
            {canLeaveKey && (
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
            A key is stored in this browser (
            <code className="break-words font-mono">{masked}</code>). Verifying another key replaces
            it
            {canLeaveKey
              ? '; signing out removes it and clears every cached response.'
              : '. This tab is signed in with a session, so that session — not this key — is the credential being sent until it signs out.'}
          </p>
        )}

        {/* #5: say plainly what a stored key means on someone else's machine —
            localStorage outlives the tab, so the key outlives the visit. */}
        <p className="mt-2 text-xs text-muted-foreground">
          Shared device? Sign out before you leave: the stored key survives closing the tab and
          would re-send itself from this browser.
        </p>

        {/* Toggle to password form */}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-2 h-auto max-lg:h-10 px-0"
          onClick={() => setMode('password')}
        >
          <UserCheck className="size-4 mr-1.5" aria-hidden />
          Use username & password instead
        </Button>
      </Card>
      )}

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
            <Field data-invalid={pwdFieldErrors.username ? 'true' : undefined}>
              <FieldLabel htmlFor="login-username">Username</FieldLabel>
              <Input
                id="login-username"
                type="text"
                autoComplete="username"
                spellCheck={false}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value)
                  if (pwdFieldErrors.username) {
                    setPwdFieldErrors((previous) => ({ ...previous, username: undefined }))
                  }
                }}
                aria-invalid={pwdFieldErrors.username ? true : undefined}
                aria-describedby={pwdFieldErrors.username ? 'login-username-error' : undefined}
                placeholder="username"
                className="h-11"
              />
              <FieldError id="login-username-error">{pwdFieldErrors.username}</FieldError>
            </Field>

            <Field data-invalid={pwdFieldErrors.password ? 'true' : undefined}>
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <div className="relative">
                <Input
                  id="login-password"
                  type={pwdVisible ? 'text' : 'password'}
                  autoComplete="current-password"
                  spellCheck={false}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (pwdFieldErrors.password) {
                      setPwdFieldErrors((previous) => ({ ...previous, password: undefined }))
                    }
                  }}
                  aria-invalid={pwdFieldErrors.password ? true : undefined}
                  aria-describedby={pwdFieldErrors.password ? 'login-password-error' : undefined}
                  placeholder="password"
                  className="h-11 pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 max-lg:size-10"
                  onClick={() => setPwdVisible(!pwdVisible)}
                  aria-label={pwdVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={pwdVisible}
                >
                  {pwdVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <FieldError id="login-password-error">{pwdFieldErrors.password}</FieldError>
            </Field>

            {pwdNotice && (
              <Notice
                tone={pwdNotice.tone === 'error' ? 'danger' : 'warning'}
                icon={pwdNotice.tone === 'error' ? <KeyRound /> : <ShieldCheck />}
                title={pwdNotice.title}
              >
                {pwdNotice.body}
              </Notice>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" className="max-lg:h-11" disabled={pwdBusy}>
                <LogIn aria-hidden />
                {pwdBusy ? 'Signing in…' : 'Sign in'}
              </Button>
              {/* This button ends a session (`signOutSession`), so it appears only
                  when a session is what the server says is active — the same rule
                  the API-key card applies to its own Sign out with `hasKey`. An
                  anonymous visitor, or one signing with a key, would otherwise be
                  offered a control that ends nothing they hold. */}
              {me.auth_source === 'session' && (
                <Button
                  type="button"
                  variant="outline"
                  className="max-lg:h-11"
                  onClick={leaveSession}
                  disabled={pwdBusy}
                >
                  Sign out
                </Button>
              )}
              <Button asChild variant="link" size="sm" className="h-auto max-lg:h-10 px-0">
                <Link to={DASHBOARD_PATH}>Back to dashboard</Link>
              </Button>
            </div>
          </form>

          {/* #5: the session token lives in this tab's sessionStorage — it dies
              with the tab, but anyone holding the device while it is open is
              signed in as you. */}
          <p className="mt-2 text-xs text-muted-foreground">
            Shared device? Sign out before you leave. The session token lives in this tab only, but
            while the tab stays open it answers as you.
          </p>

          {/* Toggle back to API key form */}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto max-lg:h-10 px-0"
            onClick={() => setMode('api-key')}
          >
            <KeyRound className="size-4 mr-1.5" aria-hidden />
            Use an API key instead
          </Button>
        </Card>
      )}

      {/* Who the server says you are — for a session as much as for a key.
          Silent when nothing is stored; a warning, not a success, when a stored
          key is not recognised. */}
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
              <span className="text-xs tracking-wider text-muted-foreground uppercase">
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
                  No scopes reported — the server attached none to this credential.
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
            {/* A block, and allowed to break: as inline mono text in a narrow
                flex column this run of scope names ran past the card edge at
                390px. */}
            <code className="mt-1 block break-words font-mono">
              apikey:manage settings:write user:manage
            </code>
            {/* Named because the list is what an admin *cannot* hold: none of
                these change who is an admin. */}
          </li>
          <li>
            <Badge className="mr-1.5">
              <ShieldCheck className="mr-1 size-3" aria-hidden />
              superadmin
            </Badge>
            Everything an admin can, plus the ranks themselves —{' '}
            <code className="font-mono">role:manage</code>, which is the scope that changes a
            person’s role and decides the request queue. <code className="font-mono">*</code>{' '}
            subsumes it, so a wildcard key is a superadmin key.
          </li>
          {/* `flex-wrap` so the sentence flows onto more lines instead of being
              squeezed onto one as a single flex line. */}
          <li className="flex flex-wrap items-start gap-x-1.5 pt-1">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Keys are issued by an admin on{' '}
            <Link to={pathOf('settings')} className="underline">
              /settings
            </Link>{' '}
            (or the <code className="font-mono">zolai apikey</code> CLI for the first one) — at or
            below the issuer’s own rank, so a superadmin key is a superadmin’s to mint. This app
            never mints one without an explicit action.
          </li>
        </ul>
      </Card>
    </div>
  )
}