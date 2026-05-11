import { api } from './client'

export type FxRateOut = {
  base_code: string
  quote_code: string
  rate: string
  source: string
  fetched_at: string
}

export type FxRefreshResult = {
  fetched: number
  persisted: number
  error: string | null
}

export const fxApi = {
  list: async (): Promise<FxRateOut[]> => (await api.get('/fx/rates')).data,
  refresh: async (): Promise<FxRefreshResult> =>
    (await api.post('/fx/refresh')).data,
}
