import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, toFormError } from '../api'
import type { FormError, Role, TeamMember } from '../api'
import { useAuth } from '../auth/context'
import { FieldError, FormAlert } from '../components/FieldError'
import { Screen } from '../components/Screen'

const MEMBER_FIELDS = ['name', 'email', 'password', 'role']

// Owner only: see who works in the shop and give a new staff member a login.
export function TeamPage() {
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .listTeam()
      .then((data) => setMembers(data.users))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the team'))
  }, [])

  useEffect(load, [load])

  return (
    <Screen title="Team">
      {error && <p className="alert alert--danger">{error}</p>}
      {!members && !error && <p className="muted">Loading…</p>}

      {members?.map((m) => (
        <div key={m.id} className="row">
          <div className="row__info">
            <strong>{m.name}</strong>
            <span className="muted small">{m.email}</span>
          </div>
          <span className={`badge ${m.role === 'owner' ? 'badge--ok' : 'badge--warn'}`}>
            {m.role === 'owner' ? 'Owner' : 'Staff'}
          </span>
        </div>
      ))}

      <AddMemberForm onAdded={load} />
    </Screen>
  )
}

function AddMemberForm({ onAdded }: { onAdded: () => void }) {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!session) return
    setBusy(true)
    setError(null)
    setAdded(null)
    try {
      await api.addTeamMember({ name: name.trim(), email: email.trim(), password, role, business_id: session.businessId })
      setAdded(`${name.trim()} can now log in with ${email.trim()} and the password you chose.`)
      setName('')
      setEmail('')
      setPassword('')
      setRole('staff')
      onAdded()
    } catch (err) {
      setError(toFormError(err, 'Could not add this person'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <h2 className="card__title">Add a team member</h2>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="off" />
        <FieldError error={error} field="name" />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        <FieldError error={error} field="email" />
      </label>
      <label className="field">
        <span>Temporary password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <FieldError error={error} field="password" />
      </label>
      <label className="field">
        <span>Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="staff">Staff: records movements and counts</option>
          <option value="owner">Owner: also resolves issues and sees reports</option>
        </select>
        <FieldError error={error} field="role" />
      </label>
      <FormAlert error={error} fields={MEMBER_FIELDS} />
      {added && <p className="alert alert--ok">{added}</p>}
      <button className="btn btn--primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add team member'}
      </button>
    </form>
  )
}
