import { api } from './client'
import type { PurchaseOut } from './purchases'

export type CycleStatus = 'open' | 'closed' | 'paid'

export type CycleOut = {
  id: number
  credit_card_id: number
  period_start: string
  period_end: string
  due_date: string
  total_amount: string
  status: CycleStatus
  purchase_count: number
}

export type CycleListFilters = {
  status?: CycleStatus
  from?: string
  to?: string
}

export const cyclesApi = {
  list: async (
    cardId: number,
    filters: CycleListFilters = {}
  ): Promise<CycleOut[]> => {
    const params: Record<string, unknown> = {}
    if (filters.status) params.status = filters.status
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    const { data } = await api.get<CycleOut[]>(
      `/credit-cards/${cardId}/cycles`,
      { params }
    )
    return data
  },
  getCurrent: async (cardId: number): Promise<CycleOut> => {
    const { data } = await api.get<CycleOut>(
      `/credit-cards/${cardId}/cycles/current`
    )
    return data
  },
  get: async (cardId: number, cycleId: number): Promise<CycleOut> => {
    const { data } = await api.get<CycleOut>(
      `/credit-cards/${cardId}/cycles/${cycleId}`
    )
    return data
  },
  listPurchases: async (
    cardId: number,
    cycleId: number
  ): Promise<PurchaseOut[]> => {
    const { data } = await api.get<PurchaseOut[]>(
      `/credit-cards/${cardId}/cycles/${cycleId}/purchases`
    )
    return data
  },
}
