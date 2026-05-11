import { api } from './client'

export type UserRole = 'admin' | 'member' | 'viewer'

export type UserPublic = {
  id: number
  email: string
  name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export type TokenResponse = {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  user: UserPublic
}

export const authApi = {
  login: async (email: string, password: string): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>('/auth/login', { email, password })
    return data
  },
  refresh: async (refreshToken: string): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    })
    return data
  },
  logout: async (refreshToken: string): Promise<void> => {
    await api.post('/auth/logout', { refresh_token: refreshToken })
  },
  me: async (): Promise<UserPublic> => {
    const { data } = await api.get<UserPublic>('/auth/me')
    return data
  },
  changePassword: async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    await api.post('/users/me/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
  },
}
