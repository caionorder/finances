import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { authApi, type UserPublic } from '@/lib/api/auth'

type AuthContextValue = {
  user: UserPublic | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readStoredUser(): UserPublic | null {
  const raw = localStorage.getItem('user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserPublic
  } catch {
    return null
  }
}

function clearStorage() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
}

/**
 * Parse JWT payload (base64url) without verifying signature.
 * Returns the payload object or null if invalid.
 */
function parseJwt(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    // base64url → base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function isAccessTokenLikelyValid(): boolean {
  const token = localStorage.getItem('access_token')
  if (!token) return false
  const payload = parseJwt(token)
  if (!payload || typeof payload.exp !== 'number') return false
  // exp é em segundos UTC; comparar com agora
  const nowSec = Math.floor(Date.now() / 1000)
  return payload.exp > nowSec + 5 // 5s de margem
}

function isRefreshTokenLikelyValid(): boolean {
  const token = localStorage.getItem('refresh_token')
  if (!token) return false
  const payload = parseJwt(token)
  if (!payload || typeof payload.exp !== 'number') return false
  const nowSec = Math.floor(Date.now() / 1000)
  return payload.exp > nowSec + 5
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(() => readStoredUser())
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    // Só fica em loading se há token e é provavelmente válido
    return Boolean(localStorage.getItem('access_token'))
  })
  const didHydrate = useRef(false)

  useEffect(() => {
    if (didHydrate.current) return
    didHydrate.current = true

    const hasAccess = isAccessTokenLikelyValid()
    const hasRefresh = isRefreshTokenLikelyValid()

    // Sem nenhum token válido → logout instantâneo
    if (!hasAccess && !hasRefresh) {
      clearStorage()
      setUser(null)
      setIsLoading(false)
      return
    }

    // Access token expirado mas refresh ok → cliente vai tentar refresh transparente.
    // Access token ainda válido → tentar /me direto.

    // Safety timeout: 3s. Se /me hangar, força logout.
    // NOTA: NÃO usar `cancelled` flag aqui — sob React StrictMode em dev, o
    // cleanup do useEffect roda entre os dois mounts e cancelaria a promise
    // antes do /me retornar, deixando isLoading=true pra sempre.
    // didHydrate.current já previne dupla execução. setUser/setIsLoading em
    // componente "desmontado" gera apenas warning, tolerado.
    const safetyTimer = setTimeout(() => {
      console.warn('[auth] hydration timed out (3s), forcing unauth state')
      clearStorage()
      setUser(null)
      setIsLoading(false)
    }, 3000)

    ;(async () => {
      try {
        const fresh = await authApi.me()
        localStorage.setItem('user', JSON.stringify(fresh))
        setUser(fresh)
      } catch (err) {
        console.warn('[auth] /me failed, clearing session', err)
        clearStorage()
        setUser(null)
      } finally {
        clearTimeout(safetyTimer)
        setIsLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    function handleForcedLogout() {
      clearStorage()
      setUser(null)
      setIsLoading(false)
    }
    window.addEventListener('auth:logout', handleForcedLogout)
    return () => window.removeEventListener('auth:logout', handleForcedLogout)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('refresh_token')
    if (refresh) {
      try {
        await authApi.logout(refresh)
      } catch {
        // ignore — still clear local state
      }
    }
    clearStorage()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
