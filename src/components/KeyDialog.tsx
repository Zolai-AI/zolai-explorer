import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  clearApiKey,
  getApiKey,
  maskApiKey,
  setApiKey,
  subscribeApiKey,
} from '../lib/key'
import { queryClient } from '../lib/queryClient'

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

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const save = useCallback(() => {
    const next = value.trim()
    if (!next) return
    setApiKey(next)
    // Any previously cached response may have been produced without a key.
    queryClient.clear()
    onClose()
  }, [value, onClose])

  const clear = useCallback(() => {
    clearApiKey()
    queryClient.clear()
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="key-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <h2 id="key-dialog-title" className="text-base font-semibold text-slate-100">
          API key
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Stored in this browser only (<code className="font-mono">localStorage</code>). It is sent
          as the <code className="font-mono">X-API-Key</code> header to the Zolai Core API and is
          never logged or committed.
        </p>

        {reason && (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {reason}
          </p>
        )}

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <label htmlFor="api-key-input" className="block text-xs font-medium text-slate-300">
            Key
          </label>
          <input
            id="api-key-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="paste API key"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Stored key: <span className="font-mono text-slate-400">{masked}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clear}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!value.trim()}
                className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save key
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}