import { useEffect, useState } from 'react'
import { api, toFormError } from '../api'
import type { Account, FormError } from '../api'
import { useAuth } from '../auth/context'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FieldError, FormAlert } from '../components/FieldError'
import { PasswordInput } from '../components/PasswordInput'
import { Screen } from '../components/Screen'
import { clearOutbox } from '../offline/outbox'

export function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getAccount()
      .then((data) => {
        if (!cancelled) setAccount(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your account')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen title="Account">
      {error && <p className="alert alert--danger">{error}</p>}
      {!account && !error && <p className="muted">Loading…</p>}

      {account && (
        <>
          <div className="card">
            <strong>{account.name}</strong>
            <span className="muted small">{account.email}</span>
            <span className="small">
              {account.role === 'owner' ? 'Owner' : 'Staff'} at {account.business_name}
            </span>
          </div>
          {account.role === 'owner' ? <DeleteBusiness account={account} /> : <DeleteOwnAccount />}
        </>
      )}
    </Screen>
  )
}

// Once the account is gone: drop anything still queued offline for it, log out,
// and reload the app on the home page, which shows what happened. A full page
// load also clears everything the app still holds in memory for this account.
function useLeaveAfterDelete() {
  const { logout } = useAuth()
  return async (deleted: 'account' | 'business') => {
    await clearOutbox()
    logout()
    window.location.replace(`/?deleted=${deleted}`)
  }
}

function DeleteOwnAccount() {
  const leave = useLeaveAfterDelete()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormError | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await api.deleteOwnAccount(password)
      await leave('account')
    } catch (err) {
      setError(toFormError(err, 'Could not delete your account'))
      setBusy(false)
    }
  }

  return (
    <section className="card danger-zone stack" aria-labelledby="delete-me-title">
      <h2 id="delete-me-title" className="card__title">
        Delete my account
      </h2>
      <p className="small">You'll be logged out and won't be able to log in again with this email.</p>
      <button type="button" className="btn btn--danger" onClick={() => setOpen(true)}>
        Delete my account
      </button>

      <ConfirmDialog
        open={open}
        title="Delete your account?"
        confirmLabel="Delete my account"
        busy={busy}
        canConfirm={password !== ''}
        onConfirm={confirm}
        onCancel={() => {
          setOpen(false)
          setPassword('')
          setError(null)
        }}
      >
        <p>
          Your name is replaced with "Removed user" and your email is freed. The movements and counts you recorded
          stay in the shop's records, because the owner needs them to keep the stock history complete.
        </p>
        <div className="field">
          <label htmlFor="delete-me-password">Your password</label>
          <PasswordInput
            id="delete-me-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <FieldError error={error} field="password" />
        </div>
        <FormAlert error={error} fields={['password']} />
      </ConfirmDialog>
    </section>
  )
}

function DeleteBusiness({ account }: { account: Account }) {
  const leave = useLeaveAfterDelete()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [typedName, setTypedName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const nameMatches = typedName.trim() === account.business_name.trim()

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await api.deleteBusiness(password, typedName)
      await leave('business')
    } catch (err) {
      setError(toFormError(err, 'Could not delete the business'))
      setBusy(false)
    }
  }

  return (
    <section className="card danger-zone stack" aria-labelledby="danger-title">
      <h2 id="danger-title" className="card__title">
        Danger zone
      </h2>
      <p className="small">
        Delete {account.business_name} and everything in it: products, movements, counts, discrepancies, the audit log
        and every team member's login. This can't be undone.
      </p>
      <button type="button" className="btn btn--danger" onClick={() => setOpen(true)}>
        Delete this business
      </button>

      <ConfirmDialog
        open={open}
        title={`Delete ${account.business_name}?`}
        confirmLabel="Delete everything"
        busy={busy}
        canConfirm={password !== '' && nameMatches}
        onConfirm={confirm}
        onCancel={() => {
          setOpen(false)
          setPassword('')
          setTypedName('')
          setError(null)
        }}
      >
        <p>
          All of the shop's data is permanently deleted, and you and your team are logged out. Download the
          loan-readiness report first if you want to keep a copy.
        </p>
        <div className="field">
          <label htmlFor="delete-business-name">
            Type <strong>{account.business_name}</strong> to confirm
          </label>
          <input
            id="delete-business-name"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            autoComplete="off"
            required
          />
          <FieldError error={error} field="business_name" />
        </div>
        <div className="field">
          <label htmlFor="delete-business-password">Your password</label>
          <PasswordInput
            id="delete-business-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <FieldError error={error} field="password" />
        </div>
        <FormAlert error={error} fields={['password', 'business_name']} />
      </ConfirmDialog>
    </section>
  )
}
