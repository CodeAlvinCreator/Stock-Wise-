import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark } from './Logo'

// Shared frame for the login and sign-up pages, so neither is a dead end.
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="login">
      <Link to="/" className="back-link">
        <span aria-hidden="true">←</span> Back to StockWise home
      </Link>
      <Link to="/" className="logo" aria-label="StockWise home">
        <LogoMark />
        <span>StockWise</span>
      </Link>
      <p className="muted">Know what's on your shelves, and prove it to your lender.</p>
      <h1 className="login__title">{title}</h1>
      {children}
    </div>
  )
}
