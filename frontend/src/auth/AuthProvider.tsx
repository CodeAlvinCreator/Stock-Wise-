import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, getToken, setToken } from '../api'
import type { Role } from '../api'
import { AuthContext } from './context'
import type { Session } from './context'

const EMAIL_KEY = 'stockwise_email'

// A JWT is three base64url parts: header.payload.signature.
// We only read the payload (the server already checked the signature).
function sessionFromToken(token: string, email: string): Session | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(payload))
    // Treat an expired token as logged out
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null
    return {
      userId: claims.sub,
      businessId: claims.business_id,
      role: claims.role as Role,
      email,
    }
  } catch {
    return null
  }
}

function initialSession(): Session | null {
  const token = getToken()
  if (!token) return null
  const session = sessionFromToken(token, localStorage.getItem(EMAIL_KEY) ?? '')
  if (!session) setToken(null)
  return session
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(initialSession)

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.login(email, password)
    setToken(access_token)
    localStorage.setItem(EMAIL_KEY, email)
    setSession(sessionFromToken(access_token, email))
  }, [])

  const register = useCallback(
    async (name: string, email: string, password: string, businessName: string) => {
      await api.register(name, email, password, businessName)
      await login(email, password)
    },
    [login],
  )

  const logout = useCallback(() => {
    setToken(null)
    localStorage.removeItem(EMAIL_KEY)
    setSession(null)
  }, [])

  const value = useMemo(() => ({ session, login, register, logout }), [session, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
