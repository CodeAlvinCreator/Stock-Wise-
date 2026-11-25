import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, causeLabel, formatDifference, formatRwf, parseServerDate } from '../api'
import type { Discrepancy, DiscrepancyStatus } from '../api'
import { useAuth } from '../auth/context'
import { Screen } from '../components/Screen'
import { useDiscrepancies } from '../useDiscrepancies'

const TABS: { value: DiscrepancyStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'investigated', label: 'Investigated' },
  { value: 'resolved', label: 'Resolved' },
]

const EMPTY_TEXT: Record<DiscrepancyStatus, string> = {
  open: 'No open discrepancies. Every count matched or has been investigated.',
  investigated: 'Nothing is waiting for the owner to resolve.',
  resolved: 'No resolved discrepancies yet.',
}

export function DiscrepanciesPage() {
  const [tab, setTab] = useState<DiscrepancyStatus>('open')

  return (
    <Screen title="Discrepancies">
      <div className="segmented segmented--3" role="tablist" aria-label="Status">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={tab === t.value ? 'segmented__on' : ''}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* key={tab} gives each tab a fresh list, so old rows never flash under the new tab */}
      <DiscrepancyList key={tab} status={tab} />
    </Screen>
  )
}

function DiscrepancyList({ status }: { status: DiscrepancyStatus }) {
  const { session } = useAuth()
  const { discrepancies, loading, error, reload } = useDiscrepancies(status)
  const [message, setMessage] = useState<string | null>(null)
  const isOwner = session?.role === 'owner'

  if (loading) return <p className="muted">Loading…</p>
  if (error) return <p className="alert alert--danger">{error}</p>

  return (
    <>
      {message && <p className="alert alert--ok">{message}</p>}
      {discrepancies.length === 0 && <p className="muted">{EMPTY_TEXT[status]}</p>}
      {status === 'investigated' && discrepancies.length > 0 && !isOwner && (
        <p className="muted small">The owner resolves these, which corrects the stock to the counted figure.</p>
      )}
      {status === 'open' && discrepancies.length > 0 && (
        <Link className="btn btn--secondary" to="/investigate">
          Investigate open discrepancies
        </Link>
      )}
      {discrepancies.map((d) => (
        <DiscrepancyRow
          key={d.id}
          discrepancy={d}
          canResolve={isOwner && d.status === 'investigated'}
          onResolved={(stockAfter) => {
            setMessage(`Resolved. ${d.product_name} stock is now ${stockAfter}.`)
            reload()
          }}
        />
      ))}
    </>
  )
}

function DiscrepancyRow({
  discrepancy: d,
  canResolve,
  onResolved,
}: {
  discrepancy: Discrepancy
  canResolve: boolean
  onResolved: (stockAfter: number) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolving moves stock to the counted figure, so ask before doing it.
  async function resolve() {
    const verb = d.difference < 0 ? 'remove' : 'add'
    if (!window.confirm(`Resolve this and ${verb} ${Math.abs(d.difference)} ${d.product_name} so stock matches the count?`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.resolveDiscrepancy(d.id)
      onResolved(result.stock_after)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve')
      setBusy(false)
    }
  }

  return (
    <div className="row">
      <div className="row__info">
        <strong>{d.product_name}</strong>
        {d.cause && <span className="small">Cause: {causeLabel(d.cause)}</span>}
        {d.finding && <span className="muted small">{d.finding}</span>}
        <span className="muted small">{parseServerDate(d.created_at).toLocaleDateString('en-GB')}</span>
        {error && <span className="small text-danger">{error}</span>}
      </div>
      <div className="row__stock">
        <strong className={d.difference < 0 ? 'text-danger' : 'text-warn'}>{formatDifference(d.difference)}</strong>
        <span className="small">{formatRwf(d.value_rwf)}</span>
        {canResolve && (
          <button type="button" className="btn btn--small" onClick={resolve} disabled={busy}>
            {busy ? '…' : 'Resolve'}
          </button>
        )}
      </div>
    </div>
  )
}
