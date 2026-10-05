import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react'
import { useApiKey } from '../components/KeyDialog'
import { Card } from '../components/Card'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Field, FieldError, FieldLabel } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { submitApiKey } from '../lib/forms'
import { signIn, signInTitle, signOut, type VerifyFailure } from '../lib/session'

/**
 * Sign in — and it is honest about what that means.
 *
 * The API has **no accounts and no login endpoint**: identity *is* an API key,
 * so this screen verifies a pasted key against the public `GET /auth/me` and
 * stores it only when the server recognises it. A rejected key is never written,
 * so a bad paste cannot clobber a working one.
 *
 * There is no session cookie to fake and no role to guess locally — after a
 * successful check the role comes from the same `/auth/me` payload the rest of
 * the app gates on.
 */
export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { hasKey, masked } = useApiKey()

  const [key, setKey] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [reason, setReason] = useState<VerifyFailure | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const from = params.get('from') ?? '/'

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

          {reason === 'unreachable' && (
            <Alert>
              <AlertTitle>Nothing was stored</AlertTitle>
              <AlertDescription>
                The API could not be reached, so the key was not verified. Public endpoints keep
                working without it.
              </AlertDescription>
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
              <Link to="/">Back to dashboard</Link>
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
            Keys are issued by an admin on <Link to="/settings" className="underline">/settings</Link>{' '}
            (or the <code className="font-mono">zolai apikey</code> CLI for the first one). This app
            never mints one without an explicit action.
          </li>
        </ul>
      </Card>
    </div>
  )
}