import { api } from './client'

export type CustomerOut = {
  legal_name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  tax_id: string | null
  billing_address_line1: string
  billing_address_line2: string | null
  billing_city: string
  billing_state: string | null
  billing_postal_code: string | null
  billing_country: string
  notes: string | null
  id: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type CustomerCreate = {
  legal_name: string
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  tax_id?: string | null
  billing_address_line1: string
  billing_address_line2?: string | null
  billing_city: string
  billing_state?: string | null
  billing_postal_code?: string | null
  billing_country?: string
  notes?: string | null
}

export type CustomerUpdate = Partial<{
  legal_name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  tax_id: string | null
  billing_address_line1: string
  billing_address_line2: string | null
  billing_city: string
  billing_state: string | null
  billing_postal_code: string | null
  billing_country: string
  notes: string | null
  is_archived: boolean
}>

export type CustomerListResponse = {
  items: CustomerOut[]
  next_cursor: string | null
  limit: number
}

export type CustomerListParams = {
  q?: string
  include_archived?: boolean
  cursor?: string | null
  limit?: number
}

function buildParams(params: CustomerListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.q) out.q = params.q
  if (params.include_archived !== undefined)
    out.include_archived = params.include_archived
  if (params.cursor) out.cursor = params.cursor
  if (params.limit !== undefined) out.limit = params.limit
  return out
}

export const customersApi = {
  list: async (
    params: CustomerListParams = {}
  ): Promise<CustomerListResponse> => {
    const { data } = await api.get<CustomerListResponse>('/customers', {
      params: buildParams(params),
    })
    return data
  },
  get: async (id: number): Promise<CustomerOut> => {
    const { data } = await api.get<CustomerOut>(`/customers/${id}`)
    return data
  },
  create: async (payload: CustomerCreate): Promise<CustomerOut> => {
    const { data } = await api.post<CustomerOut>('/customers', payload)
    return data
  },
  update: async (id: number, payload: CustomerUpdate): Promise<CustomerOut> => {
    const { data } = await api.patch<CustomerOut>(`/customers/${id}`, payload)
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/customers/${id}`)
  },
}
