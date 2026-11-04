import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/context'

// Every logged-in page uses this: green app bar on top, content, tab bar at the bottom.
export function Screen({ title, children }: { title: string; children: ReactNode }) {
  const { session, logout } = useAuth()

  return (
    <div className="screen">
      <header className="app-bar">
        <div>
          <p className="app-bar__sub">{session?.email}</p>
          <h1 className="app-bar__title">{title}</h1>
        </div>
        <button type="button" className="app-bar__logout" onClick={logout}>
          Log out
        </button>
      </header>

      <main className="content">{children}</main>

      <nav className="bottom-nav" aria-label="Main">
        <Tab to="/products" label="Products" icon={<BoxIcon />} />
        <Tab to="/movements" label="Movements" icon={<ArrowsIcon />} />
        <Tab to="/count" label="Count" icon={<ClipboardIcon />} />
        <Tab to="/reports" label="Reports" icon={<ChartIcon />} />
      </nav>
    </div>
  )
}

function Tab({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink to={to} className={({ isActive }) => `tab${isActive ? ' tab--active' : ''}`}>
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}

// Small inline icons, coloured with currentColor so the active tab turns green.
const iconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
  'aria-hidden': true,
}

function BoxIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10" />
    </svg>
  )
}

function ArrowsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 4v16 M3 8l4-4 4 4 M17 20V4 M13 16l4 4 4-4" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 4h6v3H9z M7 5H5v16h14V5h-2 M8 13l3 3 5-5" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 20V10 M12 20V4 M19 20v-7" />
    </svg>
  )
}
