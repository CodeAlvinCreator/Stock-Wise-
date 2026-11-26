import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { toFormError } from '../api'
import type { FormError } from '../api'
import { useAuth } from '../auth/context'
import { AuthLayout } from '../components/AuthLayout'
import { FieldError, FieldMessage, FormAlert } from '../components/FieldError'
import { PasswordInput } from '../components/PasswordInput'
import { emailProblem } from '../formRules'

export function LoginPage() {
  const { session, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/products" replace />

  const emailHint = emailTouched ? emailProblem(email) : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(toFormError(err, 'Something went wrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Log in">
      <form className="stack" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            required
            autoComplete="email"
            aria-invalid={emailHint !== null}
          />
          <FieldMessage message={emailHint} />
          <FieldError error={error} field="email" />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <FieldError error={error} field="password" />
        </div>

        <FormAlert error={error} fields={['email', 'password']} />

        <button className="btn btn--primary" disabled={busy || emailProblem(email) !== null || password === ''}>
          {busy ? 'Please wait…' : 'Log in'}
        </button>
        <p className="center small">
          New to StockWise?{' '}
          <Link className="strong-primary" to="/signup">
            Create your shop
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
