import { api } from './client'

export type TransactionKind = 'income' | 'expense' | 'transfer'

export type TransactionOut = {
  id: number
  account_id: number
  currency_code: string
  amount: string
  kind: TransactionKind
  category_id: number | null
  date: string
  description: string | null
  transfer_pair_id: number | null
  created_at: string
  updated_at: string
}

export type TransactionListResponse = {
  items: TransactionOut[]
  next_cursor: string | null
  limit: number
}

export type TransactionCreate = {
  account_id: number
  amount: string
  kind: 'income' | 'expense'
  category_id?: number
  date: string
  description?: string
}

export type TransactionUpdate = Partial<{
  amount: string
  category_id: number
  date: string
  description: string
}>

export type TransferCreate = {
  source_account_id: number
  destination_account_id: number
  amount: string
  date: string
  description?: string
}

export type TransferResponse = {
  source_transaction: TransactionOut
  destination_transaction: TransactionOut
}

export type TransactionFilters = {
  account_id?: number
  kind?: TransactionKind
  category_id?: number
  date_from?: string
  date_to?: string
  search?: string
}

export type TransactionListParams = TransactionFilters & {
  cursor?: string | null
  limit?: number
}

function buildParams(params: TransactionListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.account_id !== undefined) out.account_id = params.account_id
  if (params.kind !== undefined) out.kind = params.kind
  if (params.category_id !== undefined) out.category_id = params.category_id
  if (params.date_from) out.date_from = params.date_from
  if (params.date_to) out.date_to = params.date_to
  if (params.search) out.search = params.search
  if (params.cursor) out.cursor = params.cursor
  if (params.limit !== undefined) out.limit = params.limit
  return out
}

export const transactionsApi = {
  list: async (params: TransactionListParams = {}): Promise<TransactionListResponse> => {
    const { data } = await api.get<TransactionListResponse>('/transactions', {
      params: buildParams(params),
    })
    return data
  },
  get: async (id: number): Promise<TransactionOut> => {
    const { data } = await api.get<TransactionOut>(`/transactions/${id}`)
    return data
  },
  create: async (payload: TransactionCreate): Promise<TransactionOut> => {
    const { data } = await api.post<TransactionOut>('/transactions', payload)
    return data
  },
  createTransfer: async (payload: TransferCreate): Promise<TransferResponse> => {
    const { data } = await api.post<TransferResponse>('/transactions/transfer', payload)
    return data
  },
  update: async (id: number, payload: TransactionUpdate): Promise<TransactionOut> => {
    const { data } = await api.patch<TransactionOut>(`/transactions/${id}`, payload)
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/transactions/${id}`)
  },
}
