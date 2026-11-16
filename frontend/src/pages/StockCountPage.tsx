import { useState } from 'react'
import { api } from '../api'
import type { CountResult } from '../api'
import { Screen } from '../components/Screen'
import { useProducts } from '../useProducts'
import type { ProductWithStock } from '../useProducts'

// A blind count: the expected number is hidden until the person has typed
// what is physically on the shelf, so they can't just copy the record.
export function StockCountPage() {
  const { products, loading, error } = useProducts()
  const [results, setResults] = useState<Record<string, CountResult>>({})

  const done = Object.keys(results).length
  const differences = Object.values(results).filter((r) => r.kind !== 'match').length
  const [today] = useState(() => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))

  return (
    <Screen title={`Stock count · ${today}`}>
      {products.length > 0 && (
        <div className="card card--soft">
          <strong className="strong-primary">
            {done} of {products.length} products counted
            {differences > 0 && `, ${differences} with a difference`}
          </strong>
          <div className="progress">
            <div style={{ width: `${(done / products.length) * 100}%` }} />
          </div>
        </div>
      )}
      <p className="muted small">Count what is physically on the shelf. The expected number appears after you save.</p>

      {error && <p className="alert alert--danger">{error}</p>}
      {loading && <p className="muted">Loading products…</p>}

      {products.map((p) => (
        <CountRow
          key={p.id}
          product={p}
          result={results[p.id]}
          onSaved={(r) => setResults((prev) => ({ ...prev, [p.id]: r }))}
        />
      ))}
    </Screen>
  )
}

function CountRow({
  product,
  result,
  onSaved,
}: {
  product: ProductWithStock
  result: CountResult | undefined
  onSaved: (result: CountResult) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    const counted = Number(value)
    if (value === '' || !Number.isInteger(counted) || counted < 0) {
      setError('Enter a whole number, 0 or more')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await api.submitCount(product.id, counted))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the count')
    } finally {
      setBusy(false)
    }
  }

  const unit = product.unit || 'units'
  let status = null
  if (result) {
    const diff = result.discrepancy?.difference ?? 0
    status =
      result.kind === 'match' ? (
        <span className="small text-ok">Matches</span>
      ) : result.kind === 'shortage' ? (
        <span className="small text-danger">Shortage of {Math.abs(diff)}</span>
      ) : (
        <span className="small text-warn">Surplus of {diff}</span>
      )
  }

  return (
    <div className="row">
      <div className="row__info">
        <strong>{product.name}</strong>
        {result ? (
          <>
            <span className="muted small">
              Expected: {result.count.expected_quantity} {unit}
            </span>
            {status}
          </>
        ) : (
          <span className="muted small">Not counted yet</span>
        )}
        {error && <span className="small text-danger">{error}</span>}
      </div>
      {result ? (
        <span className="count-box">{result.count.counted_quantity}</span>
      ) : (
        <div className="count-entry">
          <input
            className="count-box"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`Counted ${product.name}`}
          />
          <button type="button" className="btn btn--small" onClick={save} disabled={busy}>
            {busy ? '…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
