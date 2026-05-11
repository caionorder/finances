import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const baseURL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL,
  timeout: 10000,
})

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

type RefreshResponse = {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  user: unknown
}

let refreshPromise: Promise<string> | null = null

function clearAuthStorage() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
}

async function refreshTokens(): Promise<string> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const refresh = localStorage.getItem('refresh_token')
    if (!refresh) throw new Error('no refresh token')
    const { data } = await axios.post<RefreshResponse>(
      `${baseURL}/auth/refresh`,
      { refresh_token: refresh },
      { timeout: 10000 }
    )
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    return data.access_token
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as RetryableConfig | undefined
    const status = err.response?.status
    const url = original?.url ?? ''
    const isAuthEndpoint = url.includes('/auth/')

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true
      try {
        const newAccess = await refreshTokens()
        original.headers = original.headers ?? {}
        original.headers.Authorization = `Bearer ${newAccess}`
        return api(original)
      } catch {
        clearAuthStorage()
        window.dispatchEvent(new CustomEvent('auth:logout'))
      }
    }
    return Promise.reject(err)
  }
)
