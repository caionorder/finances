import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import type { UserRole } from '@/lib/api/auth'

type RoleGateProps = {
  roles: UserRole[]
  children: ReactNode
  fallback?: ReactNode
}

export function RoleGate({ roles, children, fallback = null }: RoleGateProps) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return <>{fallback}</>
  return <>{children}</>
}
