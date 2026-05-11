import { api } from './client'
import type { RecurrenceRule } from './recurrences'

export type ReceivableStatus = 'pending' | 'overdue' | 'received'

export type ReceivableOutstandingStatusGroup = {
  count: number
  total_remaining: string
}

export type ReceivableOutstandingSummary = {
  currency_code: string | null
  total_remaining: string
  count: number
  by_status: {
    overdue: ReceivableOutstandingStatusGroup
    due_today: ReceivableOutstandingStatusGroup
    pending: ReceivableOutstandingStatusGroup
  }
}

export type ReceivableOut = {
  id: number
  description: string
  amount: string
  currency_code: string
  due_date: string
  received_at: string | null
  account_id: number | null
  category_id: number | null
  recurrence_id: number | null
  transaction_id: number | null
  notes: string | null
  status: ReceivableStatus
  created_at: string
  updated_at: string
}

export type ReceivableListResponse = {
  items: ReceivableOut[]
  next_cursor: string | null
  limit: number
}

export type ReceivableCreate = {
  description: string
  amount: string
  currency_code: string
  due_date: string
  account_id?: number
  category_id?: number
  notes?: string
  recurrence?: RecurrenceRule
}

export type ReceivableUpdate = Partial<{
  description: string
  amount: string
  due_date: string
  account_id: number | null
  category_id: number | null
  notes: string | null
}>

export type ReceivableListParams = {
  status?: ReceivableStatus
  from?: string
  to?: string
  account_id?: number
  category_id?: number
  currency_code?: string
  cursor?: string | null
  limit?: number
}

function buildParams(params: ReceivableListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.status !== undefined) out.status = params.status
  if (params.from) out.from = params.from
  if (params.to) out.to = params.to
  if (params.account_id !== undefined) out.account_id = params.account_id
  if (params.category_id !== undefined) out.category_id = params.category_id
  if (params.currency_code) out.currency_code = params.currency_code
  if (params.cursor) out.cursor = params.cursor
  if (params.limit !== undefined) out.limit = params.limit
  return out
}

export const receivablesApi = {
  list: async (
    params: ReceivableListParams = {}
  ): Promise<ReceivableListResponse> => {
    const { data } = await api.get<ReceivableListResponse>('/receivables', {
      params: buildParams(params),
    })
    return data
  },
  outstandingSummary: async (params: { currency_code?: string } = {}): Promise<ReceivableOutstandingSummary> => {
    const { data } = await api.get<ReceivableOutstandingSummary>('/receivables/outstanding-summary', {
      params: params.currency_code ? { currency_code: params.currency_code } : {},
    })
    return data
  },
  get: async (id: number): Promise<ReceivableOut> => {
    const { data } = await api.get<ReceivableOut>(`/receivables/${id}`)
    return data
  },
  create: async (payload: ReceivableCreate): Promise<ReceivableOut> => {
    const { data } = await api.post<ReceivableOut>('/receivables', payload)
    return data
  },
  update: async (
    id: number,
    payload: ReceivableUpdate
  ): Promise<ReceivableOut> => {
    const { data } = await api.patch<ReceivableOut>(
      `/receivables/${id}`,
      payload
    )
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/receivables/${id}`)
  },
  markAsReceived: async (
    id: number,
    body: { received_at?: string; account_id?: number } = {}
  ): Promise<ReceivableOut> => {
    const { data } = await api.post<ReceivableOut>(
      `/receivables/${id}/mark-as-received`,
      body
    )
    return data
  },
  unmarkAsReceived: async (id: number): Promise<ReceivableOut> => {
    const { data } = await api.post<ReceivableOut>(
      `/receivables/${id}/unmark-as-received`
    )
    return data
  },
}
