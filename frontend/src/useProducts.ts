import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Product } from './api'
import { useAuth } from './auth/context'

export interface ProductWithStock extends Product {
  stock: number
}

// Fetches the shop's products plus each product's current stock.
// Stock is calculated by the backend from the movement history
// (GET /api/products/<id>/stock), not from quantity_on_hand.
async function fetchProducts(businessId: string): Promise<ProductWithStock[]> {
  const all = await api.listProducts()
  // The products endpoint currently returns every shop's products,
  // so keep only this shop's (see the note in the frontend README).
  const mine = all.filter((p) => p.business_id === businessId)
  const stocks = await Promise.all(mine.map((p) => api.getStock(p.id)))
  return mine
    .map((p, i) => ({ ...p, stock: stocks[i].stock }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function useProducts() {
  const { session, logout } = useAuth()
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumping this number makes the effect below fetch again
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    fetchProducts(session.businessId)
      .then((list) => {
        if (cancelled) return
        setProducts(list)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) logout()
        setError(err instanceof Error ? err.message : 'Could not load products')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session, logout, version])

  const reload = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  return { products, loading, error, reload }
}
