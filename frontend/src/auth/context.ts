import { createContext, useContext } from 'react'
import type { Role } from '../api'

// What we know about the logged-in user. business_id and role come from the
// JWT the backend issues at login, so no extra request is needed.
export interface Session {
  userId: string
  businessId: string
  role: Role
  email: string
}

export interface AuthContextValue {
  session: Session | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, businessName: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
