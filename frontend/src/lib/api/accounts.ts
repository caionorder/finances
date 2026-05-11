import { api } from './client'

export type AccountType = 'checking' | 'savings' | 'cash' | 'investment'

export type AccountOut = {
  id: number
  name: string
  type: AccountType
  currency_code: string
  opening_balance: string
  notes: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type AccountWithBalance = AccountOut & { current_balance: string }

export type AccountCreate = {
  name: string
  type: AccountType
  currency_code: string
  opening_balance?: string
  notes?: string
}

export type AccountUpdate = Partial<{
  name: string
  type: AccountType
  opening_balance: string
  notes: string
  is_archived: boolean
}>

export type AclEntryOut = {
  user_id: number
  user_email: string
  user_name: string
  permission: 'read' | 'write'
}

export type BalanceResponse = {
  account_id: number
  currency_code: string
  opening_balance: string
  movements_total: string
  current_balance: string
  as_of: string
}

export const accountsApi = {
  list: async (includeArchived = false): Promise<AccountWithBalance[]> => {
    const { data } = await api.get<AccountWithBalance[]>('/accounts', {
      params: { include_archived: includeArchived },
    })
    return data
  },
  get: async (id: number): Promise<AccountOut> => {
    const { data } = await api.get<AccountOut>(`/accounts/${id}`)
    return data
  },
  create: async (payload: AccountCreate): Promise<AccountOut> => {
    const { data } = await api.post<AccountOut>('/accounts', payload)
    return data
  },
  update: async (id: number, payload: AccountUpdate): Promise<AccountOut> => {
    const { data } = await api.patch<AccountOut>(`/accounts/${id}`, payload)
    return data
  },
  archive: async (id: number): Promise<void> => {
    await api.delete(`/accounts/${id}`)
  },
  balance: async (id: number, asOf?: string): Promise<BalanceResponse> => {
    const { data } = await api.get<BalanceResponse>(`/accounts/${id}/balance`, {
      params: asOf ? { as_of: asOf } : {},
    })
    return data
  },
  listAcls: async (id: number): Promise<AclEntryOut[]> => {
    const { data } = await api.get<AclEntryOut[]>(`/accounts/${id}/acls`)
    return data
  },
  setAcls: async (
    id: number,
    acls: { user_id: number; permission: 'read' | 'write' }[]
  ): Promise<AclEntryOut[]> => {
    const { data } = await api.put<AclEntryOut[]>(`/accounts/${id}/acls`, { acls })
    return data
  },
  removeAcl: async (accountId: number, userId: number): Promise<void> => {
    await api.delete(`/accounts/${accountId}/acls/${userId}`)
  },
}
