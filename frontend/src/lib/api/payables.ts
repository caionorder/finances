import { api } from './client'
import type { RecurrenceRule } from './recurrences'

export type PayableStatus = 'pending' | 'overdue' | 'paid' | 'partially_paid'

export type OutstandingStatusGroup = {
  count: number
  total_remaining: string
}

export type PayableOutstandingSummary = {
  currency_code: string | null
  total_remaining: string
  count: number
  by_status: {
    overdue: OutstandingStatusGroup
    due_today: OutstandingStatusGroup
    pending: OutstandingStatusGroup
    partially_paid: OutstandingStatusGroup
  }
}

export type PaymentOut = {
  id: number
  transaction_id: number | null
  amount: string
  paid_at: string
  created_at: string
}

export type PayableOut = {
  id: number
  description: string
  amount: string
  currency_code: string
  due_date: string
  paid_at: string | null
  paid_amount: string
  remaining_amount: string
  account_id: number | null
  category_id: number | null
  recurrence_id: number | null
  transaction_id: number | null
  notes: string | null
  status: PayableStatus
  payments: PaymentOut[]
  created_at: string
  updated_at: string
}

export type PayableListResponse = {
  items: PayableOut[]
  next_cursor: string | null
  limit: number
}

export type PayableCreate = {
  description: string
  amount: string
  currency_code: string
  due_date: string
  account_id?: number
  category_id?: number
  notes?: string
  recurrence?: RecurrenceRule
}

export type PayableUpdate = Partial<{
  description: string
  amount: string
  due_date: string
  account_id: number | null
  category_id: number | null
  notes: string | null
}>

export type PayableListParams = {
  status?: PayableStatus
  from?: string
  to?: string
  account_id?: number
  category_id?: number
  currency_code?: string
  cursor?: string | null
  limit?: number
}

function buildParams(params: PayableListParams): Record<string, unknown> {
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

export const payablesApi = {
  list: async (params: PayableListParams = {}): Promise<PayableListResponse> => {
    const { data } = await api.get<PayableListResponse>('/payables', {
      params: buildParams(params),
    })
    return data
  },
  outstandingSummary: async (params: { currency_code?: string } = {}): Promise<PayableOutstandingSummary> => {
    const { data } = await api.get<PayableOutstandingSummary>('/payables/outstanding-summary', {
      params: params.currency_code ? { currency_code: params.currency_code } : {},
    })
    return data
  },
  upcoming: async (days: number = 7): Promise<PayableOut[]> => {
    const { data } = await api.get<PayableOut[]>('/payables/upcoming', {
      params: { days },
    })
    return data
  },
  get: async (id: number): Promise<PayableOut> => {
    const { data } = await api.get<PayableOut>(`/payables/${id}`)
    return data
  },
  create: async (payload: PayableCreate): Promise<PayableOut> => {
    const { data } = await api.post<PayableOut>('/payables', payload)
    return data
  },
  update: async (id: number, payload: PayableUpdate): Promise<PayableOut> => {
    const { data } = await api.patch<PayableOut>(`/payables/${id}`, payload)
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/payables/${id}`)
  },
  markAsPaid: async (
    id: number,
    body: { paid_at?: string; account_id?: number; amount?: number } = {}
  ): Promise<PayableOut> => {
    const { data } = await api.post<PayableOut>(
      `/payables/${id}/mark-as-paid`,
      body
    )
    return data
  },
  unmarkAsPaid: async (id: number): Promise<PayableOut> => {
    const { data } = await api.post<PayableOut>(
      `/payables/${id}/unmark-as-paid`
    )
    return data
  },
}
