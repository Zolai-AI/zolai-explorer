import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  clearApiKey,
  getApiKey,
  maskApiKey,
  subscribeApiKey,
} from '../lib/key'
import { apiKeySchema, submitApiKey, type ApiKeyInput } from '../lib/forms'
import { signIn } from '../lib/session'
import { roleBadge, useAuthMe } from '../lib/auth'
import { queryClient } from '../lib/queryClient'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Field, FieldError, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Badge } from './ui/badge'

/** Reactive read of the stored API key. The value itself never leaves the browser. */
export function useApiKey(): { key: string; hasKey: boolean; masked: string } {
  const stored = useSyncExternalStore(subscribeApiKey, getApiKey, () => '')
  return { key: stored, hasKey: stored.length > 0, masked: maskApiKey(stored) }
}

export function KeyDialog({
  open,
  onClose,
  reason,
}: {
  open: boolean
  onClose: () => void
  /** e.g. "The API rejected the stored key." */
  reason?: string
}) {
  // `hasKey` is the store's own emptiness read (`getApiKey()` via
  // `useSyncExternalStore`) — the dialog's input is write-only and reset to
  // '' on every open, so "something to clear" can only mean a stored key.
  const { hasKey, masked } = useApiKey()
  // Identity as the server sees it *now*; saving a key bumps the query
  // generation so this badge re-probes `/auth/me` on its own.
  const me = useAuthMe()
  const badge = roleBadge(me.role)

  /**
   * `useForm` + zod: the schema rejects an empty/whitespace paste *before* the
   * dialog can overwrite a working key, and the field is cleared whenever the
   * dialog re-opens. The value is only ever handed to `signIn`, which writes it
   * to `localStorage` after the server recognises it — never rendered as text,
   * logged, or put in an error message. `submitApiKey` is the pure handler the
   * tests cover.
   */
  const form = useForm<ApiKeyInput>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { apiKey: '' },
  })

  useEffect(() => {
    if (open) form.reset({ apiKey: '' })
    // Resetting is the whole point of this effect; `form` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const save = useCallback(
    async (values: ApiKeyInput) => {
      const result = submitApiKey(values)
      if (!result.ok) {
        form.setError('apiKey', { message: result.issues[0] ?? 'Invalid API key.' })
        return
      }
      // One sign-in path for both entry points. The dialog used to write
      // `setApiKey` itself, which stored an unverified key and left an active
      // session in place — and `credentials.ts` sends the session in preference
      // to the key, so the save reported success and changed nothing. `signIn`
      // verifies against `GET /auth/me` before it stores, and ends the session.
      const signedIn = await signIn(result.value)
      if (!signedIn.ok) {
        form.setError('apiKey', { message: signedIn.message })
        return
      }
      toast.success('Key verified and stored in this browser only.')
      form.clearErrors('apiKey')
      onClose()
    },
    [form, onClose],
  )

  const clear = useCallback(() => {
    clearApiKey()
    void queryClient.resetQueries()
    toast.info('API key cleared from this browser.')
    onClose()
  }, [onClose])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            API key
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {me.key_prefix && <Badge variant="outline">{me.key_prefix}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Saved here only (<code className="font-mono">localStorage</code>), and only after{' '}
            <code className="font-mono">GET /auth/me</code> recognises it; it is then sent as the{' '}
            <code className="font-mono">X-API-Key</code> header and never logged or committed. One
            credential goes out per request, so saving a key ends any password session in this tab.
            Current role: {badge.hint}
            {me.scopes.length > 0 && (
              <>
                {' '}
                Scopes: <code className="font-mono">{me.scopes.join(' ')}</code>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {reason && (
          <Alert>
            <AlertTitle>Key rejected</AlertTitle>
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        )}

        <form
          className="space-y-2"
          noValidate
          onSubmit={form.handleSubmit(save)}
        >
          <Field data-invalid={form.formState.errors.apiKey ? 'true' : undefined}>
            <FieldLabel htmlFor="api-key-input">Key</FieldLabel>
            <Input
              id="api-key-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              {...form.register('apiKey')}
              aria-invalid={form.formState.errors.apiKey ? 'true' : undefined}
              placeholder="paste API key"
              className="h-10 font-mono"
            />
            <FieldError errors={[form.formState.errors.apiKey]} />
          </Field>

          <p className="text-xs text-muted-foreground">
            Stored key: <span className="font-mono">{masked}</span>
          </p>

          <DialogFooter className="mt-4 sm:justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground max-lg:h-10"
                  // No stored key → nothing to clear; an enabled button here
                  // would advertise an action that does nothing.
                  disabled={!hasKey}
                >
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear the stored API key?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the key from <code className="font-mono">localStorage</code> in this
                    browser and clears every cached response. It cannot be undone — paste the key
                    again to restore it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={clear}>
                    Clear key
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="max-lg:h-10"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} className="max-lg:h-10">
                {form.formState.isSubmitting ? 'Verifying…' : 'Save key'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
