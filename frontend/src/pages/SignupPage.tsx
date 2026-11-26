import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { toFormError } from '../api'
import type { FormError } from '../api'
import { useAuth } from '../auth/context'
import { AuthLayout } from '../components/AuthLayout'
import { FieldError, FieldMessage, FormAlert } from '../components/FieldError'
import { NewPasswordFields } from '../components/NewPasswordFields'
import { emailProblem, newPasswordIsValid } from '../formRules'

const FORM_FIELDS = ['name', 'business_name', 'email', 'password']

// Registering creates the business and makes this person its owner.
export function SignupPage() {
  const { session, register } = useAuth()
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<FormError | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/products" replace />

  const emailHint = emailTouched ? emailProblem(email) : null
  const valid =
    name.trim() !== '' &&
    businessName.trim() !== '' &&
    emailProblem(email) === null &&
    newPasswordIsValid(password, confirm)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    setError(null)
    setBusy(true)
    try {
      await register(name.trim(), email.trim(), password, businessName.trim())
    } catch (err) {
      setError(toFormError(err, 'Something went wrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Create your shop">
      <form className="stack" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="signup-name">Your name</label>
          <input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" />
          <FieldError error={error} field="name" />
        </div>
        <div className="field">
          <label htmlFor="signup-business">Shop name</label>
          <input
            id="signup-business"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            maxLength={120}
            autoComplete="organization"
            placeholder="Kimironko Mini Market"
          />
          <FieldError error={error} field="business_name" />
        </div>
        <div className="field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            required
            autoComplete="email"
            aria-invalid={emailHint !== null || error?.field === 'email'}
          />
          <FieldMessage message={emailHint} />
          <FieldError error={error} field="email" />
        </div>
        <NewPasswordFields
          idPrefix="signup"
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
          serverError={error}
        />

        <FormAlert error={error} fields={FORM_FIELDS} />

        <button className="btn btn--primary" disabled={busy || !valid}>
          {busy ? 'Please wait…' : 'Create my shop'}
        </button>
        <p className="center small">
          Already have an account?{' '}
          <Link className="strong-primary" to="/login">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
