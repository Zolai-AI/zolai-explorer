/**
 * Endpoint bindings for the review queue.
 *
 * Three endpoints:
 * - GET /records — read-only rows over whitelisted tables (dataset:read scope)
 * - GET /audit — read-only data_audit_log tail (audit:read scope)
 * - PATCH /review/records/{table}/{id} — correct a row (dataset:edit scope)
 */

import { useQuery, useMutation } from '@tanstack/react-query'
import { apiGet, apiPatch } from '../../lib/api'
import { endpointPath, queryLimitPath } from '../../lib/endpoints'
import { parseOrThrow, CorrectionResponseSchema } from '../../lib/schemas'

export const RECORDS_WHITELIST = [
  'dictionary',
  'bible_verses',
  'grammar_patterns',
  'phrases',
  'vocabulary',
] as const

export type TableName = typeof RECORDS_WHITELIST[number]

export interface RecordListResponse {
  table: string
  items: Record<string, unknown>[]
  next_cursor: string | null
  has_more: boolean
}

export interface AuditItem {
  id: number
  table_name: string
  row_id: number
  field: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  reason: string
}

export interface AuditListResponse {
  items: AuditItem[]
  next_cursor: string | null
  has_more: boolean
}

export interface CorrectionBody {
  corrected_fields: Record<string, string | number | null>
  reason: string
}

export interface CorrectionResponse {
  table: string
  id: number
  updated_fields: string[]
  review_status: string | null
  audit_rows: number
}

function reviewPath(table: string, rowId: number): string {
  return endpointPath('review.correct', { table, row_id: rowId })
}

/**
 * GET /api/v1/records — read rows from a whitelisted table.
 */
export function useListRecords(params: {
  table: TableName
  q?: string
  limit?: number
  cursor?: number
}) {
  return useQuery({
    queryKey: ['records', params],
    queryFn: async () => {
      const url = queryLimitPath(
        'records.list',
        { table: params.table },
        params.limit ?? 50,
      )
      const fullUrl = params.q ? `${url}&q=${encodeURIComponent(params.q)}` : url
      const data = await apiGet<RecordListResponse>(fullUrl, { timeoutMs: 15_000 })
      return data as RecordListResponse
    },
    enabled: !!params.table,
  })
}

/**
 * GET /api/v1/audit — read audit log tail.
 */
export function useListAudit(params: {
  table?: string
  row_id?: number
  limit?: number
  cursor?: number
}) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params.table) searchParams.set('table', params.table)
      if (params.row_id) searchParams.set('row_id', String(params.row_id))
      if (params.limit) searchParams.set('limit', String(params.limit))
      if (params.cursor) searchParams.set('cursor', String(params.cursor))
      const url = `${endpointPath('audit.list')}?${searchParams.toString()}`
      const data = await apiGet<{ items: AuditItem[]; next_cursor: string | null; has_more: boolean }>(url, { timeoutMs: 15_000 })
      return data
    },
  })
}

/**
 * PATCH /api/v1/review/records/{table}/{id} — submit a field correction.
 */
export function useCorrectRecord() {
  return useMutation({
    mutationFn: async (body: {
      table: TableName
      rowId: number
      corrected_fields: Record<string, string | number | null>
      reason: string
    }): Promise<CorrectionResponse> => {
      const resp = await apiPatch<CorrectionResponse>(
        reviewPath(body.table, body.rowId),
        { corrected_fields: body.corrected_fields, reason: body.reason },
        { timeoutMs: 30_000 },
      )
      return parseOrThrow(CorrectionResponseSchema, resp, 'record correction') as CorrectionResponse
    },
  })
}

export interface AuditItem {
  id: number
  table_name: string
  row_id: number
  field: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  reason: string
}

export interface RecordListResponse {
  table: string
  items: Record<string, unknown>[]
  next_cursor: string | null
  has_more: boolean
}

export interface AuditListResponse {
  items: AuditItem[]
  next_cursor: string | null
  has_more: boolean
}

export interface CorrectionBody {
  corrected_fields: Record<string, string | number | null>
  reason: string
}

export interface CorrectionResponse {
  table: string
  id: number
  updated_fields: string[]
  review_status: string | null
  audit_rows: number
}
