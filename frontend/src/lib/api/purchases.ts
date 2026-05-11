import { api } from './client'

export type PurchaseOut = {
  id: number
  credit_card_id: number
  currency_code: string
  amount: string
  purchase_date: string
  description: string | null
  merchant: string | null
  category_id: number | null
  installment_n: number
  installment_of: number
  parent_purchase_id: number | null
  billing_cycle_id: number | null
  created_at: string
  updated_at: string
}

export type PurchaseListResponse = {
  items: PurchaseOut[]
  next_cursor: string | null
  limit: number
}

export type PurchaseCreate = {
  amount: string
  purchase_date: string
  description?: string
  merchant?: string
  category_id?: number
  installments: number
}

export type PurchaseUpdate = Partial<{
  amount: string
  description: string
  merchant: string
  category_id: number | null
}>

export type PurchaseSeriesCreatedResponse = {
  series_id: number
  installments: number
  total_amount: string
  purchases: PurchaseOut[]
}

export type PurchaseFilters = {
  cycle_id?: number
  date_from?: string
  date_to?: string
  search?: string
}

export type PurchaseListParams = PurchaseFilters & {
  cursor?: string | null
  limit?: number
}

function buildParams(params: PurchaseListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.cycle_id !== undefined) out.cycle_id = params.cycle_id
  if (params.date_from) out.date_from = params.date_from
  if (params.date_to) out.date_to = params.date_to
  if (params.search) out.search = params.search
  if (params.cursor) out.cursor = params.cursor
  if (params.limit !== undefined) out.limit = params.limit
  return out
}

export const purchasesApi = {
  create: async (
    cardId: number,
    payload: PurchaseCreate
  ): Promise<PurchaseSeriesCreatedResponse> => {
    const { data } = await api.post<PurchaseSeriesCreatedResponse>(
      `/credit-cards/${cardId}/purchases`,
      payload
    )
    return data
  },
  list: async (
    cardId: number,
    params: PurchaseListParams = {}
  ): Promise<PurchaseListResponse> => {
    const { data } = await api.get<PurchaseListResponse>(
      `/credit-cards/${cardId}/purchases`,
      { params: buildParams(params) }
    )
    return data
  },
  get: async (purchaseId: number): Promise<PurchaseOut> => {
    const { data } = await api.get<PurchaseOut>(
      `/credit-card-purchases/${purchaseId}`
    )
    return data
  },
  update: async (
    purchaseId: number,
    payload: PurchaseUpdate
  ): Promise<PurchaseOut> => {
    const { data } = await api.patch<PurchaseOut>(
      `/credit-card-purchases/${purchaseId}`,
      payload
    )
    return data
  },
  remove: async (purchaseId: number): Promise<void> => {
    await api.delete(`/credit-card-purchases/${purchaseId}`)
  },
}
