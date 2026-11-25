import { useEffect, useState } from 'react'
import { api, parseServerDate } from '../api'
import type { AuditEntry } from '../api'
import { Screen } from '../components/Screen'

// "discrepancy.resolved" -> "Discrepancy resolved"
function actionLabel(action: string): string {
  const text = action.replace(/[._]/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Owner only: who did what, newest first. The backend checks the role too.
export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .listAuditLogs()
      .then((data) => {
        if (!cancelled) setEntries(data.audit_logs)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the audit log')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen title="Audit log">
      {error && <p className="alert alert--danger">{error}</p>}
      {!entries && !error && <p className="muted">Loading…</p>}
      {entries?.length === 0 && <p className="muted">Nothing has been recorded yet.</p>}

      {entries?.map((entry) => (
        <div key={entry.id} className="row">
          <div className="row__info">
            <strong>{actionLabel(entry.action)}</strong>
            <span className="small">By {entry.user_name ?? 'a removed user'}</span>
            <span className="muted small">
              {entry.entity_type} {entry.entity_id?.slice(0, 8)}
            </span>
          </div>
          <span className="muted small">
            {parseServerDate(entry.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
      ))}
    </Screen>
  )
}
