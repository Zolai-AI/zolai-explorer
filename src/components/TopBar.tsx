import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { HealthPill } from './HealthPill'
import { KeyDialog, useApiKey } from './KeyDialog'

export function TopBar() {
  const { hasKey, masked } = useApiKey()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState<string | undefined>(undefined)

  const openDialog = (why?: string) => {
    setReason(why)
    setDialogOpen(true)
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/85 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-300 ring-1 ring-emerald-500/30"
        >
          Z
        </span>
        <span className="truncate text-sm font-semibold tracking-tight text-slate-100">
          Zolai Explorer
        </span>
        <span className="hidden text-[10px] tracking-wider text-slate-600 uppercase lg:inline">
          studio
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <HealthPill />

        <button
          type="button"
          onClick={() => openDialog()}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            hasKey
              ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
          }`}
          title={hasKey ? `API key set (${masked})` : 'No API key — public endpoints only'}
        >
          {hasKey ? (
            <ShieldCheck className="size-3.5" aria-hidden />
          ) : (
            <KeyRound className="size-3.5" aria-hidden />
          )}
          <span className="hidden sm:inline">{hasKey ? 'API key' : 'Set API key'}</span>
        </button>

        {dialogOpen && (
          <KeyDialog open={dialogOpen} reason={reason} onClose={() => setDialogOpen(false)} />
        )}
      </div>
    </header>
  )
}
