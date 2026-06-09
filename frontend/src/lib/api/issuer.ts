import { api } from './client'

export type IssuerProfileOut = {
  legal_name: string
  ruc: string
  address_line1: string
  address_line2: string | null
  city: string
  country: string
  email: string | null
  phone: string | null
  bank_name: string
  bank_address: string | null
  bank_country: string
  swift_bic: string
  account_number: string | null
  iban: string | null
  intermediary_bank_name: string | null
  intermediary_swift_bic: string | null
  intermediary_account_number: string | null
  intermediary_bank_country: string | null
  receiving_account_id: number | null
  bank_receiving_fee: string
  default_income_category_id: number | null
  wire_reference_instructions: string | null
  default_payment_terms_days: number
  tax_status_note: string | null
  id: number
  created_at: string
  updated_at: string
}

export type IssuerProfileUpsert = {
  legal_name: string
  ruc: string
  address_line1: string
  address_line2?: string | null
  city: string
  country?: string
  email?: string | null
  phone?: string | null
  bank_name: string
  bank_address?: string | null
  bank_country?: string
  swift_bic: string
  account_number?: string | null
  iban?: string | null
  intermediary_bank_name?: string | null
  intermediary_swift_bic?: string | null
  intermediary_account_number?: string | null
  intermediary_bank_country?: string | null
  receiving_account_id?: number | null
  bank_receiving_fee?: string
  default_income_category_id?: number | null
  wire_reference_instructions?: string | null
  default_payment_terms_days?: number
  tax_status_note?: string | null
}

export const issuerApi = {
  get: async (): Promise<IssuerProfileOut | null> => {
    const { data } = await api.get<IssuerProfileOut | null>('/settings/issuer')
    return data ?? null
  },
  upsert: async (payload: IssuerProfileUpsert): Promise<IssuerProfileOut> => {
    const { data } = await api.put<IssuerProfileOut>('/settings/issuer', payload)
    return data
  },
}
