import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import { AuditLogPage } from './pages/AuditLogPage'
import { DiscrepanciesPage } from './pages/DiscrepanciesPage'
import { EditProductPage } from './pages/EditProductPage'
import { InventoryValuePage } from './pages/InventoryValuePage'
import { InvestigatePage } from './pages/InvestigatePage'
import { LoginPage } from './pages/LoginPage'
import { ProductsPage } from './pages/ProductsPage'
import { RecordMovementPage } from './pages/RecordMovementPage'
import { StockCountPage } from './pages/StockCountPage'
import { TeamPage } from './pages/TeamPage'

// Sends anyone who isn't logged in back to the login page
function RequireLogin({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  return session ? children : <Navigate to="/login" replace />
}

// Owner-only screens. The backend refuses staff anyway, this just keeps them off the page.
function RequireOwner({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  return session.role === 'owner' ? children : <Navigate to="/products" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/products" element={<RequireLogin><ProductsPage /></RequireLogin>} />
          <Route path="/products/:id/edit" element={<RequireLogin><EditProductPage /></RequireLogin>} />
          <Route path="/movements"element={<RequireLogin><RecordMovementPage /></RequireLogin>} />
          <Route path="/count" element={<RequireLogin><StockCountPage /></RequireLogin>} />
          <Route path="/investigate" element={<RequireLogin><InvestigatePage /></RequireLogin>} />
          <Route path="/discrepancies" element={<RequireLogin><DiscrepanciesPage /></RequireLogin>} />
          <Route path="/reports" element={<RequireLogin><InventoryValuePage /></RequireLogin>} />
          <Route path="/team" element={<RequireOwner><TeamPage /></RequireOwner>} />
          <Route path="/audit" element={<RequireOwner><AuditLogPage /></RequireOwner>} />
          <Route path="*" element={<Navigate to="/products" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
