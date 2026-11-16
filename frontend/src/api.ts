// All calls to the StockWise Flask API go through this file.
// The API address comes from VITE_API_URL (see .env.example).

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:5000').replace(/\/$/, '')
const TOKEN_KEY = 'stockwise_token'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

// Sends one request, attaches the login token, and turns error responses
// into an ApiError carrying the message the backend sent back.
async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    // flask-jwt-extended sends {msg}, our own routes send {error}
    const message = data.error ?? data.msg ?? `Request failed (${response.status})`
    throw new ApiError(response.status, message)
  }
  return data as T
}

// ---------- Types that mirror the backend's JSON ----------

export type Role = 'owner' | 'staff'

export interface Product {
  id: string
  business_id: string
  name: string
  sku: string | null
  unit: string | null
  quantity_on_hand: number
  reorder_level: number
  unit_cost: number
}

export type MovementType = 'purchase' | 'sale' | 'return' | 'damage'

export interface Movement {
  id: string
  product_id: string
  movement_type: MovementType
  quantity: number
  note: string | null
  created_at: string
}

export interface CountResult {
  count: { id: string; product_id: string; expected_quantity: number; counted_quantity: number }
  kind: 'shortage' | 'surplus' | 'match'
  discrepancy: { id: string; difference: number; status: string } | null
}

export interface ValuationItem {
  product_id: string
  name: string
  sku: string | null
  unit: string | null
  stock: number
  unit_cost: number
  value: number
}

export interface Valuation {
  business_id: string
  currency: string
  total_value: number
  product_count: number
  items: ValuationItem[]
  warnings: { negative_stock: string[]; missing_unit_cost: string[] }
  generated_at: string
}

// ---------- Endpoints ----------

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>('/api/auth/login', { method: 'POST', body: { email, password } }),

  register: (name: string, email: string, password: string, business_name: string) =>
    request<{ id: string; email: string; role: Role; business_id: string }>('/api/auth/register', {
      method: 'POST',
      body: { name, email, password, business_name },
    }),

  listProducts: () => request<Product[]>('/api/products'),

  createProduct: (product: {
    business_id: string
    name: string
    sku?: string
    unit?: string
    unit_cost: number
    reorder_level: number
  }) => request<Product>('/api/products', { method: 'POST', body: product }),

  getStock: (productId: string) =>
    request<{ product_id: string; name: string; stock: number }>(`/api/products/${productId}/stock`),

  recordMovement: (movement: { product_id: string; movement_type: MovementType; quantity: number; note?: string }) =>
    request<Movement>('/api/movements', { method: 'POST', body: movement }),

  submitCount: (product_id: string, counted_quantity: number) =>
    request<CountResult>('/api/counts', { method: 'POST', body: { product_id, counted_quantity } }),

  getValuation: () => request<Valuation>('/api/reports/valuation'),
}

// Formats whole Rwandan francs, for example 117500 -> "117,500 RWF"
export function formatRwf(amount: number): string {
  return `${amount.toLocaleString('en-US')} RWF`
}
