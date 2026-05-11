import { api } from './client'

export type ApiKeyOut = {
  id: number
  name: string
  scopes: string[]
  last_used_at: string | null
  revoked_at: string | null
  created_by_user_id: number | null
  created_at: string
  updated_at: string
}

export type ApiKeyCreatedResponse = ApiKeyOut & { plain_key: string }

export const apiKeysApi = {
  list: async (): Promise<ApiKeyOut[]> => {
    const { data } = await api.get<ApiKeyOut[]>('/api-keys')
    return data
  },
  create: async (name: string, scopes: string[]): Promise<ApiKeyCreatedResponse> => {
    const { data } = await api.post<ApiKeyCreatedResponse>('/api-keys', { name, scopes })
    return data
  },
  revoke: async (id: number): Promise<ApiKeyOut> => {
    const { data } = await api.post<ApiKeyOut>(`/api-keys/${id}/revoke`)
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/api-keys/${id}`)
  },
}
