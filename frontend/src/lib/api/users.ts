import { api } from './client'
import type { UserPublic, UserRole } from './auth'

export type UserCreatedResponse = UserPublic & { temporary_password: string }
export type PasswordResetResponse = { temporary_password: string }

export type CreateUserPayload = {
  email: string
  name: string
  role: UserRole
}

export type UpdateUserPayload = Partial<{
  name: string
  role: UserRole
  is_active: boolean
}>

export const usersApi = {
  list: async (): Promise<UserPublic[]> => {
    const { data } = await api.get<UserPublic[]>('/users')
    return data
  },
  create: async (payload: CreateUserPayload): Promise<UserCreatedResponse> => {
    const { data } = await api.post<UserCreatedResponse>('/users', payload)
    return data
  },
  update: async (id: number, payload: UpdateUserPayload): Promise<UserPublic> => {
    const { data } = await api.patch<UserPublic>(`/users/${id}`, payload)
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/users/${id}`)
  },
  resetPassword: async (id: number): Promise<PasswordResetResponse> => {
    const { data } = await api.post<PasswordResetResponse>(`/users/${id}/reset-password`)
    return data
  },
}
