import { api } from './client'

export type CardType = 'credit' | 'debit'

export type CreditCardOut = {
  id: number
  name: string
  card_type: CardType
  currency_code: string
  limit_amount: string | null
  closing_day: number | null
  due_day: number | null
  payment_account_id: number | null
  parent_card_id: number | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type CreditCardWithSummary = CreditCardOut & {
  current_cycle_total: string
  current_cycle_due_date: string | null
  available_credit: string | null
  permission_for_me?: 'read' | 'write' | null
  is_additional?: boolean
}

export type CreditCardCreate = {
  name: string
  card_type: CardType
  currency_code: string
  limit_amount?: string
  closing_day?: number
  due_day?: number
  payment_account_id?: number
  parent_card_id?: number
}

export type CreditCardUpdate = Partial<{
  name: string
  limit_amount: string
  closing_day: number
  due_day: number
  payment_account_id: number | null
  is_archived: boolean
}>

export type CreditCardAclEntryOut = {
  user_id: number
  user_email: string
  user_name: string
  permission: 'read' | 'write'
}

export const creditCardsApi = {
  list: async (includeArchived = false): Promise<CreditCardWithSummary[]> => {
    const { data } = await api.get<CreditCardWithSummary[]>('/credit-cards', {
      params: { include_archived: includeArchived },
    })
    return data
  },
  get: async (id: number): Promise<CreditCardOut> => {
    const { data } = await api.get<CreditCardOut>(`/credit-cards/${id}`)
    return data
  },
  create: async (payload: CreditCardCreate): Promise<CreditCardOut> => {
    const { data } = await api.post<CreditCardOut>('/credit-cards', payload)
    return data
  },
  update: async (id: number, payload: CreditCardUpdate): Promise<CreditCardOut> => {
    const { data } = await api.patch<CreditCardOut>(`/credit-cards/${id}`, payload)
    return data
  },
  archive: async (id: number): Promise<void> => {
    await api.delete(`/credit-cards/${id}`)
  },
  listChildren: async (id: number): Promise<CreditCardOut[]> => {
    const { data } = await api.get<CreditCardOut[]>(`/credit-cards/${id}/children`)
    return data
  },
  listAcls: async (id: number): Promise<CreditCardAclEntryOut[]> => {
    const { data } = await api.get<CreditCardAclEntryOut[]>(`/credit-cards/${id}/acls`)
    return data
  },
  setAcls: async (
    id: number,
    acls: { user_id: number; permission: 'read' | 'write' }[]
  ): Promise<CreditCardAclEntryOut[]> => {
    const { data } = await api.put<CreditCardAclEntryOut[]>(
      `/credit-cards/${id}/acls`,
      { acls }
    )
    return data
  },
  removeAcl: async (cardId: number, userId: number): Promise<void> => {
    await api.delete(`/credit-cards/${cardId}/acls/${userId}`)
  },
}
