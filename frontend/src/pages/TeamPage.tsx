import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, toFormError } from '../api'
import type { FormError, Role, TeamMember } from '../api'
import { useAuth } from '../auth/context'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FieldError, FieldMessage, FormAlert } from '../components/FieldError'
import { NewPasswordFields } from '../components/NewPasswordFields'
import { Screen } from '../components/Screen'
import { emailProblem, newPasswordIsValid } from '../formRules'

const MEMBER_FIELDS = ['name', 'email', 'password', 'role']

// Owner only: see who works in the shop, give a new staff member a login, or remove one.
export function TeamPage() {
  const { session } = useAuth()
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [busy, setBusy] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .listTeam()
      .then((data) => setMembers(data.users))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the team'))
  }, [])

  useEffect(load, [load])

  async function confirmRemove() {
    if (!removing) return
    setBusy(true)
    setRemoveError(null)
    try {
      await api.removeTeamMember(removing.id)
      setNotice(`${removing.name} was removed. Their past movements and counts are kept.`)
      setRemoving(null)
      load()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not remove this person')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Team">
      {error && <p className="alert alert--danger">{error}</p>}
      {notice && <p className="alert alert--ok">{notice}</p>}
      {!members && !error && <p className="muted">Loading…</p>}

      {members?.map((m) => (
        <div key={m.id} className="row">
          <div className="row__info">
            <strong>{m.name}</strong>
            <span className="muted small">{m.email}</span>
          </div>
          <div className="row__stock">
            <span className={`badge ${m.role === 'owner' ? 'badge--ok' : 'badge--warn'}`}>
              {m.role === 'owner' ? 'Owner' : 'Staff'}
            </span>
            {m.role === 'staff' && m.id !== session?.userId && (
              <button
                type="button"
                className="btn btn--small btn--quiet"
                onClick={() => {
                  setRemoveError(null)
                  setRemoving(m)
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}

      <AddMemberForm onAdded={load} />

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        confirmLabel="Remove from team"
        busy={busy}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      >
        <p>
          {removing?.name} will be logged out straight away and won't be able to log in again. Their name is
          replaced with "Removed user" and their email is freed, so you can add them again later.
        </p>
        <p className="muted small">
          The movements, counts and investigations they recorded stay in your records and in the audit log.
        </p>
        {removeError && <p className="alert alert--danger">{removeError}</p>}
      </ConfirmDialog>
    </Screen>
  )
}

function AddMemberForm({ onAdded }: { onAdded: () => void }) {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  const emailHint = emailTouched ? emailProblem(email) : null
  const valid = name.trim() !== '' && emailProblem(email) === null && newPasswordIsValid(password, confirm)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!session || !valid) return
    setBusy(true)
    setError(null)
    setAdded(null)
    try {
      await api.addTeamMember({ name: name.trim(), email: email.trim(), password, role, business_id: session.businessId })
      setAdded(`${name.trim()} can now log in with ${email.trim().toLowerCase()} and the password you chose.`)
      setName('')
      setEmail('')
      setEmailTouched(false)
      setPassword('')
      setConfirm('')
      setRole('staff')
      onAdded()
    } catch (err) {
      setError(toFormError(err, 'Could not add this person'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit} noValidate>
      <h2 className="card__title">Add a team member</h2>
      <div className="field">
        <label htmlFor="member-name">Name</label>
        <input id="member-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="off" />
        <FieldError error={error} field="name" />
      </div>
      <div className="field">
        <label htmlFor="member-email">Email</label>
        <input
          id="member-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          required
          autoComplete="off"
          aria-invalid={emailHint !== null || error?.field === 'email'}
        />
        <FieldMessage message={emailHint} />
        <FieldError error={error} field="email" />
      </div>
      <NewPasswordFields
        idPrefix="member"
        password={password}
        confirm={confirm}
        onPasswordChange={setPassword}
        onConfirmChange={setConfirm}
        serverError={error}
      />
      <div className="field">
        <label htmlFor="member-role">Role</label>
        <select id="member-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="staff">Staff: sales, deliveries and counts</option>
          <option value="owner">Owner: also reports and approvals</option>
        </select>
        <FieldError error={error} field="role" />
      </div>
      <FormAlert error={error} fields={MEMBER_FIELDS} />
      {added && <p className="alert alert--ok">{added}</p>}
      <button className="btn btn--primary" disabled={busy || !valid}>
        {busy ? 'Adding…' : 'Add team member'}
      </button>
    </form>
  )
}
