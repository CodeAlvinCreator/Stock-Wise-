import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Discrepancy, DiscrepancyStatus } from './api'
import { useAuth } from './auth/context'

// Loads the shop's discrepancies with one status (newest first, sorted by the backend).
export function useDiscrepancies(status: DiscrepancyStatus) {
  const { session, logout } = useAuth()
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumping this number makes the effect below fetch again
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    api
      .listDiscrepancies(status)
      .then((data) => {
        if (cancelled) return
        setDiscrepancies(data.discrepancies)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) logout()
        setError(err instanceof Error ? err.message : 'Could not load discrepancies')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session, logout, status, version])

  const reload = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  return { discrepancies, loading, error, reload }
}
