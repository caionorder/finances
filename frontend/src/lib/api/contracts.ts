import { api } from './client'

export type ContractOut = {
  customer_id: number
  reference: string
  title: string
  contract_date: string
  currency_code: string
  service_period_start: string | null
  service_period_end: string | null
  scope_description: string | null
  agreed_rate: string | null
  rate_unit: string | null
  payment_terms_days: number
  default_tax_rate: string
  default_discount: string
  is_active: boolean
  next_period_start: string | null
  notes: string | null
  id: number
  created_at: string
  updated_at: string
}

export type ContractCreate = {
  customer_id: number
  reference: string
  title: string
  contract_date: string
  currency_code?: string
  service_period_start?: string | null
  service_period_end?: string | null
  scope_description?: string | null
  agreed_rate?: string | null
  rate_unit?: string | null
  payment_terms_days?: number
  default_tax_rate?: string
  default_discount?: string
  is_active?: boolean
  next_period_start?: string | null
  notes?: string | null
}

export type ContractUpdate = Partial<{
  reference: string
  title: string
  contract_date: string
  service_period_start: string | null
  service_period_end: string | null
  scope_description: string | null
  agreed_rate: string | null
  rate_unit: string | null
  payment_terms_days: number
  default_tax_rate: string
  default_discount: string
  is_active: boolean
  next_period_start: string | null
  notes: string | null
}>

export type ContractListParams = {
  customer_id?: number
  is_active?: boolean
}

function buildParams(params: ContractListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.customer_id !== undefined) out.customer_id = params.customer_id
  if (params.is_active !== undefined) out.is_active = params.is_active
  return out
}

export const contractsApi = {
  list: async (params: ContractListParams = {}): Promise<ContractOut[]> => {
    const { data } = await api.get<ContractOut[]>('/contracts', {
      params: buildParams(params),
    })
    return data
  },
  get: async (id: number): Promise<ContractOut> => {
    const { data } = await api.get<ContractOut>(`/contracts/${id}`)
    return data
  },
  create: async (payload: ContractCreate): Promise<ContractOut> => {
    const { data } = await api.post<ContractOut>('/contracts', payload)
    return data
  },
  update: async (id: number, payload: ContractUpdate): Promise<ContractOut> => {
    const { data } = await api.patch<ContractOut>(`/contracts/${id}`, payload)
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/contracts/${id}`)
  },
}
