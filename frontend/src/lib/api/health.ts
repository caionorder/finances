import { api } from './client'

export type HealthResponse = {
  status: 'ok' | 'error'
  db: boolean
  version: string
}

export async function healthCheck(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health')
  return data
}
