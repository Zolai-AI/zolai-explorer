/** Small formatting helpers shared across panels. */

const INT = new Intl.NumberFormat('en-US')

export function formatCount(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return INT.format(Math.trunc(n))
}

export function formatCompact(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  if (Math.abs(n) < 1000) return String(Math.trunc(n))
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** Uptime in seconds → `3d 4h 12m`. */
export function formatUptime(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.trunc(seconds)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${total % 60}s`
  return `${total}s`
}

/** ISO timestamp → `2026-10-03 11:34 UTC`. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`
}

/** Fixed-precision numeric score, avoiding `0.30000000000000004`. */
export function formatScore(n: number | null | undefined, digits = 2): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  if (n === 0) return '0'
  return n.toFixed(digits)
}

export function percent(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return `${Math.round(Math.min(Math.max(n, 0), 1) * 100)}%`
}

export function isNonEmptyArray(value: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(value) && value.length > 0
}

export function isNonEmptyRecord(value: Record<string, unknown> | null | undefined): boolean {
  return !!value && typeof value === 'object' && Object.keys(value).length > 0
}