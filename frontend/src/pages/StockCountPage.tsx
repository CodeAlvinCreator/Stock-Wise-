import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { CountResult, NewCount, ProductWithStock } from '../api'
import { Screen } from '../components/Screen'
import { queueCount } from '../offline/outbox'
import { useProducts } from '../useProducts'

// A blind count: the expected number is hidden until the person has typed
// what is physically on the shelf, so they can't just copy the record.
export function StockCountPage() {
  const { products, loading, error } = useProducts()
  const [results, setResults] = useState<Record<string, CountOutcome>>({})

  const done = Object.keys(results).length
  const differences = Object.values(results).filter((r) => r !== 'queued' && r.kind !== 'match').length
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
      {!loading && !error && products.length === 0 && (
        <p className="muted">No products to count yet. Add them on the Products tab.</p>
      )}

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

// 'queued' means it was saved on the phone and will be sent when back online.
type CountOutcome = CountResult | 'queued'

function CountRow({
  product,
  result,
  onSaved,
}: {
  product: ProductWithStock
  result: CountOutcome | undefined
  onSaved: (result: CountOutcome) => void
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
    // The id is made here, so a count queued offline is never saved twice.
    const count: NewCount = { id: crypto.randomUUID(), product_id: product.id, counted_quantity: counted }
    try {
      onSaved(await api.submitCount(count))
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        await queueCount(count)
        onSaved('queued')
      } else {
        setError(err instanceof Error ? err.message : 'Could not save the count')
      }
    } finally {
      setBusy(false)
    }
  }

  const unit = product.unit || 'units'
  let status = null
  if (result && result !== 'queued') {
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
        {result === 'queued' ? (
          <span className="muted small">Saved offline. It will sync when you are back online.</span>
        ) : result ? (
          <>
            <span className="muted small">
              Expected: {result.count.expected_quantity} {unit}
            </span>
            {status}
            {result.discrepancy && (
              <Link className="small strong-primary" to={`/investigate?id=${result.discrepancy.id}`}>
                Investigate now
              </Link>
            )}
          </>
        ) : (
          <span className="muted small">Not counted yet</span>
        )}
        {error && <span className="small text-danger">{error}</span>}
      </div>
      {result ? (
        <span className="count-box">{result === 'queued' ? value : result.count.counted_quantity}</span>
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
