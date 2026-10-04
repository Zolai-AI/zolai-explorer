import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import {
  clearApiKey,
  getApiKey,
  maskApiKey,
  setApiKey,
  subscribeApiKey,
} from '../lib/key'
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
import { Input } from './ui/input'
import { Label } from './ui/label'

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
  const [value, setValue] = useState('')

  useEffect(() => {
    if (open) setValue('')
  }, [open])

  const save = useCallback(() => {
    const next = value.trim()
    if (!next) return
    setApiKey(next)
    // Any previously cached response may have been produced without a key.
    queryClient.clear()
    toast.success('API key stored in this browser only.')
    onClose()
  }, [value, onClose])

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
          <DialogTitle>API key</DialogTitle>
          <DialogDescription>
            Stored in this browser only (<code className="font-mono">localStorage</code>). It is sent
            as the <code className="font-mono">X-API-Key</code> header to the Zolai Core API and is
            never logged or committed.
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
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <Label htmlFor="api-key-input">Key</Label>
          <Input
            id="api-key-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="paste API key"
            className="h-10 font-mono"
          />

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
              <Button type="submit" disabled={!value.trim()} className="max-lg:h-10">
                Save key
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
