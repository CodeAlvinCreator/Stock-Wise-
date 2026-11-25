// All calls to the StockWise Flask API go through this file.
// The API address comes from VITE_API_URL (see .env.example).

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:5000').replace(/\/$/, '')
const TOKEN_KEY = 'stockwise_token'

export class ApiError extends Error {
  status: number
  // The request field the backend blamed, so a form can show the message next to it
  field: string | null

  constructor(status: number, message: string, field: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
  }
}

// The message to show for any error, with the field it belongs to (if any).
export interface FormError {
  message: string
  field: string | null
}

export function toFormError(err: unknown, fallback: string): FormError {
  if (err instanceof ApiError) return { message: err.message, field: err.field }
  return { message: err instanceof Error ? err.message : fallback, field: null }
}

// AuthProvider registers its logout here, so an expired or revoked login on
// any request sends the user back to the login page.
let handleUnauthorized: () => void = () => {}

export function onUnauthorized(handler: () => void): void {
  handleUnauthorized = handler
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

// Every request goes through here. It attaches the login token and turns
// every kind of failure into an ApiError:
//   status 0   no network or server unreachable (offline screens queue on this)
//   status -1  the server is up but the browser blocked its reply (see blockedOrOffline)
//   401        login missing or expired: the user is logged out
//   otherwise  the {error, field} message the backend sent back
async function send(path: string, options: { method?: string; body?: unknown } = {}): Promise<Response> {
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
    throw await blockedOrOffline()
  }

  if (response.ok) return response

  const data = await response.json().catch(() => ({}))
  // Only log out when a token was sent. A 401 from the login form just means a wrong password.
  if (response.status === 401 && token) handleUnauthorized()
  const message =
    data.error ?? (response.status >= 500 ? 'The server had a problem. Please try again.' : `Request failed (${response.status})`)
  throw new ApiError(response.status, message, data.field ?? null)
}

// fetch() fails the same way when the phone is offline and when the browser
// blocks the reply. The browser blocks it when the server has no such route:
// the CORS check before the real request gets a 404, so the app never sees it.
// A plain GET to /api/health needs no CORS check, so it tells the two apart.
// The blocked case uses -1, not a 4xx, so the offline outbox keeps the item
// instead of deleting it (a brief network blip could look the same).
async function blockedOrOffline(): Promise<ApiError> {
  try {
    const health = await fetch(`${API_URL}/api/health`)
    if (health.ok) {
      return new ApiError(-1, 'The server could not handle this request. It may not support this action yet.')
    }
  } catch {
    // The server really can't be reached
  }
  return new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await send(path, options)
  return (await response.json()) as T
}

async function download(path: string): Promise<Blob> {
  return (await send(path)).blob()
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

// GET /api/products adds each product's current stock, worked out from the movement ledger
export interface ProductWithStock extends Product {
  stock: number
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

export type DiscrepancyStatus = 'open' | 'investigated' | 'resolved'

export type Cause =
  | 'unrecorded_sale'
  | 'damaged_or_expired'
  | 'theft'
  | 'counting_mistake'
  | 'supplier_short_delivery'
  | 'other'

// The values must match CAUSES in backend/app/routes/discrepancies.py exactly
export const CAUSE_OPTIONS: { value: Cause; label: string }[] = [
  { value: 'unrecorded_sale', label: 'Unrecorded sale' },
  { value: 'damaged_or_expired', label: 'Damaged or expired' },
  { value: 'theft', label: 'Theft' },
  { value: 'counting_mistake', label: 'Counting mistake' },
  { value: 'supplier_short_delivery', label: 'Supplier delivered less' },
  { value: 'other', label: 'Other' },
]

export function causeLabel(cause: string | null): string {
  return CAUSE_OPTIONS.find((c) => c.value === cause)?.label ?? cause ?? '—'
}

export interface Discrepancy {
  id: string
  product_id: string
  product_name: string
  difference: number // counted - expected, negative means a shortage
  value_rwf: number // difference * unit_cost, negative for a shortage
  status: DiscrepancyStatus
  cause: Cause | null
  finding: string | null
  created_at: string
  investigated_at: string | null
  resolved_at: string | null
}

export interface ResolveResult {
  discrepancy: Discrepancy
  movement_id: string
  stock_after: number
}

export interface AuditEntry {
  id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  user_id: string | null
  user_name: string | null
  details: unknown
  created_at: string
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: Role
  business_id: string
}

export interface NewCount {
  id: string
  product_id: string
  counted_quantity: number
}

export interface NewMovement {
  id: string
  product_id: string
  movement_type: MovementType
  quantity: number
  note?: string
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

  // Owner only. Uses the same register endpoint, with the owner's token and business_id.
  addTeamMember: (member: { name: string; email: string; password: string; role: Role; business_id: string }) =>
    request<{ id: string; email: string; role: Role; business_id: string }>('/api/auth/register', {
      method: 'POST',
      body: member,
    }),

  listTeam: () => request<{ users: TeamMember[] }>('/api/auth/team'),

  listProducts: () => request<ProductWithStock[]>('/api/products'),

  createProduct: (product: { name: string; sku?: string; unit?: string; unit_cost: number; reorder_level: number }) =>
    request<Product>('/api/products', { method: 'POST', body: product }),

  getProduct: (id: string) => request<Product>(`/api/products/${id}`),

  // Stock is not editable here: it only changes through movements and approved counts.
  // An empty sku or unit clears it.
  updateProduct: (id: string, changes: { name: string; sku: string; unit: string; unit_cost: number; reorder_level: number }) =>
    request<Product>(`/api/products/${id}`, { method: 'PUT', body: changes }),

  recordMovement: (movement: NewMovement) => request<Movement>('/api/movements', { method: 'POST', body: movement }),

  submitCount: (count: NewCount) => request<CountResult>('/api/counts', { method: 'POST', body: count }),

  getValuation: () => request<Valuation>('/api/reports/valuation'),

  // Owner only. from and to are YYYY-MM-DD, both included.
  downloadLoanReport: (from: string, to: string) =>
    download(`/api/reports/loan-readiness?${new URLSearchParams({ from, to })}`),

  listDiscrepancies: (status?: DiscrepancyStatus) =>
    request<{ discrepancies: Discrepancy[] }>(`/api/discrepancies${status ? `?status=${status}` : ''}`),

  investigateDiscrepancy: (id: string, cause: Cause, finding: string) =>
    request<Discrepancy>(`/api/discrepancies/${id}/investigate`, { method: 'POST', body: { cause, finding } }),

  // Owner only. The backend adds a correcting movement so stock matches the count.
  resolveDiscrepancy: (id: string) =>
    request<ResolveResult>(`/api/discrepancies/${id}/resolve`, { method: 'POST' }),

  listAuditLogs: (limit = 100) => request<{ audit_logs: AuditEntry[] }>(`/api/audit-logs?limit=${limit}`),
}

// Formats whole Rwandan francs, for example 117500 -> "117,500 RWF"
export function formatRwf(amount: number): string {
  return `${amount.toLocaleString('en-US')} RWF`
}

// The backend stores UTC times without a zone marker. Without the Z the
// browser would read them as local time and show them two hours off in Kigali.
export function parseServerDate(value: string): Date {
  return new Date(/(Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`)
}

// Signed difference for display: +3 for a surplus, −2 for a shortage
export function formatDifference(diff: number): string {
  return diff > 0 ? `+${diff}` : diff < 0 ? `−${Math.abs(diff)}` : '0'
}
