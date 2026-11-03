 import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearToken } from "../api";

export function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round">
          <path d="M12 2 21 7v10l-9 5-9-5V7z" />
          <path d="M3 7l9 5 9-5M12 12v10" />
        </svg>
      </div>
      <span>StockWise</span>
    </div>
  );
}

const TITLES: Record<string, string> = {
  "/products": "Products",
  "/movements": "Record movement",
  "/count": "Stock count",
  "/investigate": "Investigate shortage",
  "/reports": "Inventory value",
};

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const shopName = localStorage.getItem("shopName") ?? "My shop";

  let title = TITLES[location.pathname] ?? "StockWise";
  if (location.pathname === "/count") {
    const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    title = `Stock count · ${today}`;
  }

  function logout() {
    clearToken();
    navigate("/login");
  }

  return (
    <div className="phone">
      <header className="appbar">
        <div>
          <div className="appbar-shop">{shopName}</div>
          <div className="appbar-title">{title}</div>
        </div>
        <button className="appbar-logout" onClick={logout}>Log out</button>
      </header>

      <main className="screen">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        <NavLink to="/products"><Icon d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" />Products</NavLink>
        <NavLink to="/movements"><Icon d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />Movement</NavLink>
        <NavLink to="/count"><Icon d="M9 5h10M9 12h10M9 19h10M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2" />Count</NavLink>
        <NavLink to="/reports"><Icon d="M4 20V10M10 20V4M16 20v-7M22 20H2" />Reports</NavLink>
      </nav>
    </div>
  );
}