 import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { Logo } from "../components/Layout";

type AuthResponse = {
  access_token?: string;
  token?: string;
  business_name?: string;
  business?: { name?: string };
};

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function logIn() {
    const data = await api<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const token = data.access_token ?? data.token;
    if (!token) throw new Error("No token in response");
    setToken(token);
    const shop = data.business_name ?? data.business?.name;
    if (shop) localStorage.setItem("shopName", shop);
    navigate("/products");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }
      await logIn();
    } catch (err) {
      if (err instanceof TypeError) setError("Can't reach the server. Is the backend running?");
      else setError(mode === "login" ? "Wrong email or password." : "Could not register. The email may already be used.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={handleSubmit}>
        <Logo />
        <p className="tagline">Know what's on your shelves, and prove it to your lender.</p>

        <label className="field">
          <span>Email</span>
          <input className="input" type="email" placeholder="aline@kimironkomarket.rw"
            value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label className="field">
          <span>Password</span>
          <input className="input" type="password" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {mode === "login" && (
          <button type="button" className="text-link"
            onClick={() => setInfo("Password reset is not available yet. Ask your team admin.")}>
            Forgot password?
          </button>
        )}

        {error && <p className="error">{error}</p>}
        {info && <p className="hint">{info}</p>}

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create shop and log in"}
        </button>
        <button type="button" className="btn btn-secondary"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setInfo(""); }}>
          {mode === "login" ? "Register a new shop" : "I already have an account"}
        </button>
      </form>
    </div>
  );
}