const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export function getToken() { return localStorage.getItem("token"); }
export function setToken(t: string) { localStorage.setItem("token", t); }
export function clearToken() {
  localStorage.removeItem("token");
  localStorage.removeItem("shopName");
}

// Claims the backend puts in the JWT (see backend/app/routes/auth.py login()).
export type TokenClaims = { sub: string; role: "owner" | "staff"; business_id: string; exp: number };

export function getClaims(): TokenClaims | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

// True when there is a token and it has not expired yet.
export function isLoggedIn() {
  const claims = getClaims();
  return claims !== null && claims.exp * 1000 > Date.now();
}

// An error that remembers the HTTP status code (e.g. 401, 409)
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      message = body.error ?? body.message ?? body.msg ?? message;
    } catch {
      // response was not JSON
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}