import { api } from './client'

export type RecurrenceFreq = 'weekly' | 'monthly' | 'yearly' | 'custom'
export type RecurrenceKind = 'payable' | 'receivable'

export type RecurrenceRule = {
  freq: RecurrenceFreq
  interval: number
  day?: number
  month?: number
  until?: string
}

export type RecurrenceOut = {
  id: number
  kind: RecurrenceKind
  rule_json: RecurrenceRule
  template_json: Record<string, unknown>
  next_run_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type RecurrenceUpdate = Partial<{
  is_active: boolean
  rule: RecurrenceRule
  template: Record<string, unknown>
  next_run_date: string | null
}>

export type RecurrenceListParams = {
  kind?: RecurrenceKind
  is_active?: boolean
}

function buildParams(params: RecurrenceListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.kind !== undefined) out.kind = params.kind
  if (params.is_active !== undefined) out.is_active = params.is_active
  return out
}

export const recurrencesApi = {
  list: async (params: RecurrenceListParams = {}): Promise<RecurrenceOut[]> => {
    const { data } = await api.get<RecurrenceOut[]>('/recurrences', {
      params: buildParams(params),
    })
    return data
  },
  get: async (id: number): Promise<RecurrenceOut> => {
    const { data } = await api.get<RecurrenceOut>(`/recurrences/${id}`)
    return data
  },
  update: async (
    id: number,
    payload: RecurrenceUpdate
  ): Promise<RecurrenceOut> => {
    const { data } = await api.patch<RecurrenceOut>(
      `/recurrences/${id}`,
      payload
    )
    return data
  },
  generateNext: async (id: number): Promise<{ generated_id: number | null }> => {
    const { data } = await api.post<{ generated_id: number | null }>(
      `/recurrences/${id}/generate-next`
    )
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/recurrences/${id}`)
  },
}
