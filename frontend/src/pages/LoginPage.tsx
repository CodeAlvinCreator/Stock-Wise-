import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/context'

// One page for both logging in and registering a new shop.
// Registering creates the business and makes this person its owner.
export function LoginPage() {
  const { session, login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/products" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(name.trim(), email.trim(), password, businessName.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const isRegister = mode === 'register'

  return (
    <div className="login">
      <div className="logo">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
          <rect width="44" height="44" rx="12" fill="var(--primary)" />
          <path d="M12 17l10-5 10 5v11l-10 5-10-5z M12 17l10 5 10-5 M22 22v11" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <span>StockWise</span>
      </div>
      <p className="muted">Know what's on your shelves, and prove it to your lender.</p>

      <form className="stack" onSubmit={handleSubmit}>
        {isRegister && (
          <>
            <label className="field">
              <span>Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </label>
            <label className="field">
              <span>Shop name</span>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required placeholder="Kimironko Mini Market" />
            </label>
          </>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        </label>

        {error && <p className="alert alert--danger" role="alert">{error}</p>}

        <button className="btn btn--primary" disabled={busy}>
          {busy ? 'Please wait…' : isRegister ? 'Create my shop' : 'Log in'}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            setMode(isRegister ? 'login' : 'register')
            setError(null)
          }}
        >
          {isRegister ? 'I already have an account' : 'Register a new shop'}
        </button>
      </form>
    </div>
  )
}
