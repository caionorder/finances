import { api } from './client'

export type AuditLogOut = {
  id: number
  user_id: number | null
  user_email: string | null
  action: string
  entity: string
  entity_id: number | null
  payload_json: Record<string, unknown> | null
  created_at: string
}

export type AuditLogListResponse = {
  items: AuditLogOut[]
  next_cursor: string | null
  limit: number
}

export type AuditLogListParams = {
  entity?: string
  entity_id?: number
  user_id?: number
  action?: string
  from_date?: string
  to_date?: string
  cursor?: string | null
  limit?: number
}

function buildParams(params: AuditLogListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.entity) out.entity = params.entity
  if (params.entity_id !== undefined) out.entity_id = params.entity_id
  if (params.user_id !== undefined) out.user_id = params.user_id
  if (params.action) out.action = params.action
  if (params.from_date) out.from_date = params.from_date
  if (params.to_date) out.to_date = params.to_date
  if (params.cursor) out.cursor = params.cursor
  if (params.limit !== undefined) out.limit = params.limit
  return out
}

export const auditLogsApi = {
  list: async (params: AuditLogListParams = {}): Promise<AuditLogListResponse> => {
    const { data } = await api.get<AuditLogListResponse>('/audit-logs', {
      params: buildParams(params),
    })
    return data
  },
}
