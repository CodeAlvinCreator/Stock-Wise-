import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, formatRwf, toFormError } from '../api'
import type { FormError, Valuation } from '../api'
import { FieldError, FormAlert } from '../components/FieldError'
import { Screen } from '../components/Screen'

// YYYY-MM-DD for a day `days` before today
function isoDate(days = 0): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  // en-CA formats as YYYY-MM-DD in the phone's own time zone
  return date.toLocaleDateString('en-CA')
}

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

          <LoanReportDownload />

          <div className="card stack">
            <h2 className="card__title">Owner tools</h2>
            <Link className="btn btn--secondary" to="/team">
              Team
            </Link>
            <Link className="btn btn--secondary" to="/audit">
              Audit log
            </Link>
          </div>
        </>
      )}
    </Screen>
  )
}

// The PDF a lender gets: stock value, discrepancies, count accuracy and the audit trail.
function LoanReportDownload() {
  const [from, setFrom] = useState(() => isoDate(89))
  const [to, setTo] = useState(() => isoDate())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormError | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const pdf = await api.downloadLoanReport(from, to)
      const url = URL.createObjectURL(pdf)
      const link = document.createElement('a')
      link.href = url
      link.download = `stockwise-loan-readiness-${to}.pdf`
      link.click()
      // Give the browser a moment to start the download before freeing the file
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(toFormError(err, 'Could not create the report'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <h2 className="card__title">Loan-readiness report</h2>
      <span className="muted small">Discrepancies, count accuracy and activity are summarised for these dates.</span>
      <div className="two-col">
        <label className="field">
          <span>From</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
          <FieldError error={error} field="from" />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
          <FieldError error={error} field="to" />
        </label>
      </div>
      <FormAlert error={error} fields={['from', 'to']} />
      <button className="btn btn--primary" disabled={busy}>
        {busy ? 'Preparing PDF…' : 'Download loan-readiness report'}
      </button>
    </form>
  )
}
