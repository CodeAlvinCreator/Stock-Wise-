import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { formatRwf } from '../api'
import type { CountResult } from '../api'
import { Screen } from '../components/Screen'
import type { ProductWithStock } from '../useProducts'

// Investigate a shortage or surplus found during a stock count.
//
// NOT ROUTED YET. To switch it on (after main is merged into this branch):
//   1. App.tsx: add <Route path="/investigate" element={<RequireLogin><InvestigatePage /></RequireLogin>} />
//   2. StockCountPage.tsx: link here with the count results, e.g.
//      navigate('/investigate', { state: { differences } }) where each item is
//      { product, result } for a result whose kind is not 'match'.
//   3. Saving needs a backend endpoint. There is none yet
//      (backend/app/routes/discrepancies.py is empty), so the button is disabled.

export interface CountDifference {
  product: ProductWithStock
  result: CountResult
}

const REASONS = [
  'Unrecorded sale',
  'Damaged or expired',
  'Theft',
  'Counting mistake',
  'Supplier delivered less',
]

export function InvestigatePage() {
  const location = useLocation()
  const differences: CountDifference[] = (location.state as { differences?: CountDifference[] } | null)?.differences ?? []
  const [index, setIndex] = useState(0)
  const [reason, setReason] = useState(REASONS[0])
  const [finding, setFinding] = useState('')

  if (differences.length === 0) {
    return (
      <Screen title="Investigate">
        <p className="muted">No differences from the last stock count. Do a count first.</p>
      </Screen>
    )
  }

  const { product, result } = differences[Math.min(index, differences.length - 1)]
  const diff = result.discrepancy?.difference ?? 0
  const unit = product.unit || 'units'
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Will send { discrepancy_id: result.discrepancy?.id, reason, finding } once the endpoint exists.
  }

  return (
    <Screen title="Investigate">
      <form className="stack" onSubmit={handleSubmit}>
        {differences.length > 1 && (
          <label className="field">
            <span>Difference</span>
            <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
              {differences.map((d, i) => (
                <option key={d.product.id} value={i}>
                  {d.product.name} ({(d.result.discrepancy?.difference ?? 0) > 0 ? '+' : ''}
                  {d.result.discrepancy?.difference ?? 0})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className={`card ${diff < 0 ? 'card--danger' : 'card--soft'}`}>
          <strong>{product.name}</strong>
          <span className="small">Expected: {result.count.expected_quantity} {unit}</span>
          <span className="small">Counted: {result.count.counted_quantity} {unit}</span>
          <span className="big">
            {sign}{Math.abs(diff)} {unit}
            {product.unit_cost > 0 && ` (${sign}${formatRwf(Math.abs(diff) * product.unit_cost)})`}
          </span>
        </div>

        <div className="field">
          <span>What most likely happened?</span>
          <div className="pills" role="radiogroup" aria-label="Reason">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                className={`pill${reason === r ? ' pill--active' : ''}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>What did you find?</span>
          <textarea rows={3} value={finding} onChange={(e) => setFinding(e.target.value)}
            placeholder="e.g. Sold 2 bags on credit on Saturday" />
        </label>

        <p className="alert alert--warn">Saving investigations isn't available yet: the backend has no endpoint for it.</p>
        <button className="btn btn--primary" disabled>Send to owner for approval</button>
      </form>
    </Screen>
  )
}
