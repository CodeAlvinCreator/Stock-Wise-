import { useEffect, useState } from 'react'
import { api, ApiError, formatRwf } from '../api'
import type { Valuation } from '../api'
import { Screen } from '../components/Screen'

export function InventoryValuePage() {
  const [data, setData] = useState<Valuation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getValuation()
      .then((v) => {
        if (!cancelled) setData(v)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 403) setError('Only the shop owner can see the inventory value.')
        else setError(err instanceof Error ? err.message : 'Could not load the report')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const nameOf = (id: string) => data?.items.find((i) => i.product_id === id)?.name ?? id

  return (
    <Screen title="Inventory value">
      {error && <p className="alert alert--danger">{error}</p>}
      {!data && !error && <p className="muted">Calculating…</p>}

      {data && (
        <>
          <div className="card card--primary">
            <span className="small">Total stock value today</span>
            <span className="huge">{formatRwf(data.total_value)}</span>
            <span className="small">{data.product_count} products · calculated from every recorded movement</span>
          </div>

          {data.items.length > 0 && (
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Qty</th>
                    <th className="num">Value (RWF)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.items]
                    .sort((a, b) => b.value - a.value)
                    .map((item) => (
                      <tr key={item.product_id}>
                        <td>{item.name}</td>
                        <td className="num">{item.stock}</td>
                        <td className="num strong">{item.value.toLocaleString('en-US')}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {data.warnings.negative_stock.length > 0 && (
            <p className="alert alert--warn">
              More sold than received, counted as 0: {data.warnings.negative_stock.map(nameOf).join(', ')}. Check
              their movements.
            </p>
          )}
          {data.warnings.missing_unit_cost.length > 0 && (
            <p className="alert alert--warn">
              No cost price yet, so they add nothing to the total: {data.warnings.missing_unit_cost.map(nameOf).join(', ')}.
            </p>
          )}

          <button className="btn btn--secondary" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </>
      )}
    </Screen>
  )
}
