import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import { InventoryValuePage } from './pages/InventoryValuePage'
import { LoginPage } from './pages/LoginPage'
import { ProductsPage } from './pages/ProductsPage'
import { RecordMovementPage } from './pages/RecordMovementPage'
import { StockCountPage } from './pages/StockCountPage'

// Sends anyone who isn't logged in back to the login page
function RequireLogin({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  return session ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/products" element={<RequireLogin><ProductsPage /></RequireLogin>} />
          <Route path="/movements" element={<RequireLogin><RecordMovementPage /></RequireLogin>} />
          <Route path="/count" element={<RequireLogin><StockCountPage /></RequireLogin>} />
          <Route path="/reports" element={<RequireLogin><InventoryValuePage /></RequireLogin>} />
          <Route path="*" element={<Navigate to="/products" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
