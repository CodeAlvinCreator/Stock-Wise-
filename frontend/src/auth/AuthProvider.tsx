import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, getToken, onUnauthorized, setToken } from '../api'
import type { Role } from '../api'
import { flushOutbox } from '../offline/outbox'
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
    // The server matches emails trimmed and lowercased, so show it the same way
    const savedEmail = email.trim().toLowerCase()
    setToken(access_token)
    localStorage.setItem(EMAIL_KEY, savedEmail)
    setSession(sessionFromToken(access_token, savedEmail))
    // Anything queued while the old login had expired can be sent now.
    void flushOutbox()
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

  // Any request that comes back 401 logs the user out. With no session,
  // RequireLogin then redirects to the login page.
  useEffect(() => onUnauthorized(logout), [logout])

  const value = useMemo(() => ({ session, login, register, logout }), [session, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
