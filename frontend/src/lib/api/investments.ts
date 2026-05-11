import { api } from './client'

export type InvestmentType =
  | 'cdb'
  | 'lci'
  | 'lca'
  | 'tesouro'
  | 'poupanca'
  | 'fundo'
  | 'acoes'
  | 'cripto'
  | 'outros'

export type RatePeriod = 'monthly' | 'semiannual' | 'annual'
export type RateKind = 'fixed' | 'percent_of_index' | 'index_plus'
export type IndexRef = 'cdi' | 'selic' | 'ipca' | 'igpm'
export type Liquidity = 'daily' | 'on_maturity'
export type MovementType = 'deposit' | 'withdrawal' | 'interest'

export type InvestmentOut = {
  id: number
  name: string
  type: InvestmentType
  account_id: number | null
  currency_code: string
  principal: string
  start_date: string
  maturity_date: string | null
  rate_value: string
  rate_period: RatePeriod
  rate_kind: RateKind
  index_ref: IndexRef | null
  liquidity: Liquidity
  notes: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export type InvestmentWithPosition = InvestmentOut & {
  total_invested: string
  total_withdrawn: string
  current_value: string
  gross_gain: string
  gain_percent: string
}

export type MovementOut = {
  id: number
  investment_id: number
  type: MovementType
  amount: string
  date: string
  transaction_id: number | null
  notes: string | null
  created_at: string
}

export type PositionResponse = {
  investment_id: number
  as_of: string
  principal: string
  total_invested: string
  total_withdrawn: string
  current_value: string
  gross_gain: string
  gain_percent: string
  days_elapsed: number
}

export type ProjectionPoint = { date: string; value: string }
export type ProjectionResponse = {
  investment_id: number
  until: string
  points: ProjectionPoint[]
}

export type InvestmentCreate = {
  name: string
  type: InvestmentType
  account_id?: number | null
  currency_code: string
  principal: string
  start_date: string
  maturity_date?: string | null
  rate_value: string
  rate_period: RatePeriod
  rate_kind: RateKind
  index_ref?: IndexRef | null
  liquidity: Liquidity
  notes?: string | null
}

export type InvestmentUpdate = Partial<{
  name: string
  type: InvestmentType
  account_id: number | null
  maturity_date: string | null
  rate_value: string
  rate_period: RatePeriod
  rate_kind: RateKind
  index_ref: IndexRef | null
  liquidity: Liquidity
  notes: string | null
  is_archived: boolean
}>

export type MovementCreate = {
  type: MovementType
  amount: string
  date: string
  notes?: string | null
}

export const investmentsApi = {
  list: async (includeArchived = false): Promise<InvestmentWithPosition[]> => {
    const { data } = await api.get<InvestmentWithPosition[]>('/investments', {
      params: { include_archived: includeArchived },
    })
    return data
  },
  get: async (id: number): Promise<InvestmentOut> => {
    const { data } = await api.get<InvestmentOut>(`/investments/${id}`)
    return data
  },
  create: async (payload: InvestmentCreate): Promise<InvestmentOut> => {
    const { data } = await api.post<InvestmentOut>('/investments', payload)
    return data
  },
  update: async (id: number, payload: InvestmentUpdate): Promise<InvestmentOut> => {
    const { data } = await api.patch<InvestmentOut>(`/investments/${id}`, payload)
    return data
  },
  archive: async (id: number): Promise<void> => {
    await api.delete(`/investments/${id}`)
  },
  position: async (id: number, asOf?: string): Promise<PositionResponse> => {
    const { data } = await api.get<PositionResponse>(
      `/investments/${id}/position`,
      { params: asOf ? { as_of: asOf } : {} }
    )
    return data
  },
  projection: async (id: number, until: string): Promise<ProjectionResponse> => {
    const { data } = await api.get<ProjectionResponse>(
      `/investments/${id}/projection`,
      { params: { until } }
    )
    return data
  },
  listMovements: async (id: number): Promise<MovementOut[]> => {
    const { data } = await api.get<MovementOut[]>(
      `/investments/${id}/movements`
    )
    return data
  },
  createMovement: async (
    id: number,
    payload: MovementCreate
  ): Promise<MovementOut> => {
    const { data } = await api.post<MovementOut>(
      `/investments/${id}/movements`,
      payload
    )
    return data
  },
  removeMovement: async (id: number, mvId: number): Promise<void> => {
    await api.delete(`/investments/${id}/movements/${mvId}`)
  },
}
