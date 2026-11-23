import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, CAUSE_OPTIONS, formatDifference, formatRwf } from '../api'
import type { Cause } from '../api'
import { Screen } from '../components/Screen'
import { useDiscrepancies } from '../useDiscrepancies'

const MAX_FINDING = 1000

// Staff explain why a count did not match the records. The owner approves it
// afterwards on the Discrepancies page. Opening /investigate?id=<discrepancy id>
// preselects that discrepancy (the stock count page links here like that).
export function InvestigatePage() {
  const [searchParams] = useSearchParams()
  const { discrepancies, loading, error, reload } = useDiscrepancies('open')
  const [selectedId, setSelectedId] = useState(searchParams.get('id') ?? '')
  const [cause, setCause] = useState<Cause>(CAUSE_OPTIONS[0].value)
  const [finding, setFinding] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedName, setSavedName] = useState<string | null>(null)

  // Falls back to the first one if the id is missing or already investigated
  const current = discrepancies.find((d) => d.id === selectedId) ?? discrepancies[0]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!current) return
    const text = finding.trim()
    if (text.length === 0 || text.length > MAX_FINDING) {
      setSaveError(`Describe what you found (1 to ${MAX_FINDING} characters)`)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await api.investigateDiscrepancy(current.id, cause, text)
      setSavedName(current.product_name)
      setFinding('')
      setCause(CAUSE_OPTIONS[0].value)
      reload()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the investigation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen title="Investigate">
      {savedName && (
        <p className="alert alert--ok">
          Saved. {savedName} is waiting for the owner's approval. <Link to="/discrepancies">View discrepancies</Link>
        </p>
      )}
      {error && <p className="alert alert--danger">{error}</p>}
      {loading && <p className="muted">Loading discrepancies…</p>}

      {!loading && !error && !current && (
        <p className="muted">No open discrepancies. Every difference has been investigated.</p>
      )}

      {current && (
        <form className="stack" onSubmit={handleSubmit}>
          {discrepancies.length > 1 && (
            <label className="field">
              <span>Difference</span>
              <select value={current.id} onChange={(e) => setSelectedId(e.target.value)}>
                {discrepancies.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.product_name} ({formatDifference(d.difference)})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className={`card ${current.difference < 0 ? 'card--danger' : 'card--soft'}`}>
            <strong>{current.product_name}</strong>
            <span className="small">
              {current.difference < 0 ? 'Shortage' : 'Surplus'} found on{' '}
              {new Date(current.created_at).toLocaleDateString('en-GB')}
            </span>
            <span className="big">
              {formatDifference(current.difference)} units
              {current.value_rwf !== 0 && ` (${formatRwf(current.value_rwf)})`}
            </span>
          </div>

          <div className="field">
            <span>What most likely happened?</span>
            <div className="pills" role="radiogroup" aria-label="Cause">
              {CAUSE_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={cause === c.value}
                  className={`pill${cause === c.value ? ' pill--active' : ''}`}
                  onClick={() => setCause(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>What did you find?</span>
            <textarea
              rows={3}
              maxLength={MAX_FINDING}
              value={finding}
              onChange={(e) => setFinding(e.target.value)}
              placeholder="e.g. Sold 2 bags on credit on Saturday"
            />
          </label>

          {saveError && <p className="alert alert--danger">{saveError}</p>}
          <button className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Send to owner for approval'}
          </button>
        </form>
      )}
    </Screen>
  )
}
