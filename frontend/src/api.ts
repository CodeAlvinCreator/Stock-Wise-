 const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export function getToken() { return localStorage.getItem("token"); }
export function setToken(t: string) { localStorage.setItem("token", t); }
export function clearToken() { localStorage.removeItem("token"); }

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}