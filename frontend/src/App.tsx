import { Routes, Route, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { isLoggedIn } from "./api";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Products from "./pages/Products";
import StockMovements from "./pages/StockMovements";
import StockCount from "./pages/StockCount";
import Investigate from "./pages/Investigate";
import InventoryValue from "./pages/InventoryValue";

function RequireAuth({ children }: { children: ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/products" element={<Products />} />
        <Route path="/movements" element={<StockMovements />} />
        <Route path="/count" element={<StockCount />} />
        <Route path="/investigate" element={<Investigate />} />
        <Route path="/reports" element={<InventoryValue />} />
      </Route>
      <Route path="*" element={<Navigate to={isLoggedIn() ? "/products" : "/login"} replace />} />
    </Routes>
  );
}