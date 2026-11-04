import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, setToken } from "../api";
import { Logo } from "../components/Layout";

// POST /api/auth/login -> { access_token }
type LoginResponse = { access_token: string };

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function logIn() {
    const data = await api<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.access_token);
    navigate("/products");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "register") {
        // Registering without business_id creates a new business; the user becomes its owner.
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password, business_name: businessName }),
        });
        // The login response has no business name, so remember it from registration.
        localStorage.setItem("shopName", businessName);
      }
      await logIn();
    } catch (err) {
      if (err instanceof TypeError) setError("Can't reach the server. Is the backend running?");
      else if (mode === "login") setError("Wrong email or password.");
      else if (err instanceof ApiError && err.status === 409) setError("This email is already used. Log in instead.");
      else setError(err instanceof Error ? `Could not register: ${err.message}` : "Could not register.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={handleSubmit}>
        <Logo />
        <p className="tagline">Know what's on your shelves, and prove it to your lender.</p>

        {mode === "register" && (
          <>
            <label className="field">
              <span>Your name</span>
              <input className="input" name="name" autoComplete="name" placeholder="Aline Uwase"
                value={name} onChange={(e) => setName(e.target.value)} required />
            </label>

            <label className="field">
              <span>Shop name</span>
              <input className="input" name="business_name" autoComplete="organization" placeholder="Kimironko Market Shop"
                value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
            </label>
          </>
        )}

        <label className="field">
          <span>Email</span>
          <input className="input" type="email" name="email" autoComplete="email" placeholder="aline@kimironkomarket.rw"
            value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label className="field">
          <span>Password</span>
          <input className="input" type="password" name="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="••••••••"
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
