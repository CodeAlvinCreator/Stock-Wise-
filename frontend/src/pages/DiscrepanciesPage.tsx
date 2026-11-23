import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, causeLabel, formatDifference, formatRwf } from '../api'
import type { Discrepancy, DiscrepancyStatus } from '../api'
import { useAuth } from '../auth/context'
import { Screen } from '../components/Screen'
import { useDiscrepancies } from '../useDiscrepancies'

const TABS: { value: DiscrepancyStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'investigated', label: 'Investigated' },
  { value: 'resolved', label: 'Resolved' },
]

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
      {discrepancies.length === 0 && <p className="muted">Nothing here.</p>}
      {status === 'open' && discrepancies.length > 0 && (
        <Link className="btn btn--secondary" to="/investigate">
          Investigate open discrepancies
        </Link>
      )}
      {discrepancies.map((d) => (
        <DiscrepancyRow
          key={d.id}
          discrepancy={d}
          canApprove={isOwner && d.status === 'investigated'}
          onApproved={(stockAfter) => {
            setMessage(`Approved. ${d.product_name} stock is now ${stockAfter}.`)
            reload()
          }}
        />
      ))}
    </>
  )
}

function DiscrepancyRow({
  discrepancy: d,
  canApprove,
  onApproved,
}: {
  discrepancy: Discrepancy
  canApprove: boolean
  onApproved: (stockAfter: number) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      const result = await api.approveDiscrepancy(d.id)
      onApproved(result.stock_after)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve')
      setBusy(false)
    }
  }

  return (
    <div className="row">
      <div className="row__info">
        <strong>{d.product_name}</strong>
        {d.cause && <span className="small">Cause: {causeLabel(d.cause)}</span>}
        {d.finding && <span className="muted small">{d.finding}</span>}
        <span className="muted small">{new Date(d.created_at).toLocaleDateString('en-GB')}</span>
        {error && <span className="small text-danger">{error}</span>}
      </div>
      <div className="row__stock">
        <strong className={d.difference < 0 ? 'text-danger' : 'text-warn'}>{formatDifference(d.difference)}</strong>
        <span className="small">{formatRwf(d.value_rwf)}</span>
        {canApprove && (
          <button type="button" className="btn btn--small" onClick={approve} disabled={busy}>
            {busy ? '…' : 'Approve'}
          </button>
        )}
      </div>
    </div>
  )
}
