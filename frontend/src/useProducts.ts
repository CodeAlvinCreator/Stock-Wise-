import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { ProductWithStock } from './api'
import { useAuth } from './auth/context'

// Loads the shop's products, sorted by name. The backend only returns this
// shop's products and works out each one's stock from the movement history.
export function useProducts() {
  const { session } = useAuth()
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumping this number makes the effect below fetch again
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    api
      .listProducts()
      .then((list) => {
        if (cancelled) return
        setProducts(list)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load products')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session, version])

  const reload = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  return { products, loading, error, reload }
}
