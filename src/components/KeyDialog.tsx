import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  clearApiKey,
  getApiKey,
  maskApiKey,
  setApiKey,
  subscribeApiKey,
} from '../lib/key'
import { apiKeySchema, submitApiKey, type ApiKeyInput } from '../lib/forms'
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
  const { masked } = useApiKey()
  // Identity as the server sees it *now*; saving a key bumps the query
  // generation so this badge re-probes `/auth/me` on its own.
  const me = useAuthMe()
  const badge = roleBadge(me.role)

  /**
   * `useForm` + zod: the schema rejects an empty/whitespace paste *before* the
   * dialog can overwrite a working key, and the field is cleared whenever the
   * dialog re-opens. The value is only ever handed to `setApiKey`
   * (`localStorage`) — never rendered as text, logged, or put in an error
   * message. `submitApiKey` is the pure handler the tests cover.
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
    (values: ApiKeyInput) => {
      const result = submitApiKey(values)
      if (!result.ok) {
        form.setError('apiKey', { message: result.issues[0] ?? 'Invalid API key.' })
        return
      }
      setApiKey(result.value)
      // Any previously cached response may have been produced without a key.
      queryClient.clear()
      toast.success('API key stored in this browser only.')
      form.clearErrors('apiKey')
      onClose()
    },
    [form, onClose],
  )

  const clear = useCallback(() => {
    clearApiKey()
    queryClient.clear()
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
            Stored in this browser only (<code className="font-mono">localStorage</code>). It is sent
            as the <code className="font-mono">X-API-Key</code> header to the Zolai Core API and is
            never logged or committed. Current role: {badge.hint}
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
                Save key
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
