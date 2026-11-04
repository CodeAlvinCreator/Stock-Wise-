import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { MovementType } from '../api'
import { Screen } from '../components/Screen'
import { useProducts } from '../useProducts'

// Purchases and returns add stock, sales and damage remove it.
// This matches MOVEMENT_SIGNS in backend/app/routes/stock_movements.py.
const TYPES: { value: MovementType; label: string; sign: 1 | -1 }[] = [
  { value: 'purchase', label: 'Purchase', sign: 1 },
  { value: 'sale', label: 'Sale', sign: -1 },
  { value: 'return', label: 'Return', sign: 1 },
  { value: 'damage', label: 'Damage', sign: -1 },
]

export function RecordMovementPage() {
  const { products, loading, error: loadError, reload } = useProducts()
  const [params] = useSearchParams()
  const [chosenId, setChosenId] = useState<string>(params.get('product') ?? '')
  const [type, setType] = useState<MovementType>('purchase')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Fall back to the first product until the user picks one
  const productId = chosenId || products[0]?.id || ''
  const product = products.find((p) => p.id === productId)
  const qty = Number(quantity)
  const sign = TYPES.find((t) => t.value === type)!.sign
  const after = product && Number.isInteger(qty) && qty > 0 ? product.stock + sign * qty : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!product) return
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      await api.recordMovement({
        product_id: product.id,
        movement_type: type,
        quantity: qty,
        note: note.trim() || undefined,
      })
      setSaved(`Saved: ${TYPES.find((t) => t.value === type)!.label.toLowerCase()} of ${qty} ${product.unit || 'units'} of ${product.name}.`)
      setQuantity('')
      setNote('')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the movement')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Record movement">
      {loadError && <p className="alert alert--danger">{loadError}</p>}
      {loading && products.length === 0 && <p className="muted">Loading products…</p>}
      {!loading && products.length === 0 && !loadError && (
        <p className="muted">Add a product first, on the Products tab.</p>
      )}

      {products.length > 0 && (
        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Product</span>
            <select value={productId} onChange={(e) => setChosenId(e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.stock} in stock)
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>Type</span>
            <div className="segmented" role="radiogroup" aria-label="Movement type">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={type === t.value}
                  className={type === t.value ? 'segmented__on' : ''}
                  onClick={() => setType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Quantity ({product?.unit || 'units'})</span>
            <input type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </label>

          <label className="field">
            <span>Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="Delivery from Nyabugogo wholesaler" />
          </label>

          {product && after !== null && (
            <div className={`card ${after < 0 ? 'card--danger' : 'card--soft'}`}>
              <span className="small strong-primary">Stock after saving</span>
              <span className="big">
                {product.stock} → {after} {product.unit || 'units'}
              </span>
              {after < 0 && <span className="small">That's more than you have recorded. Check the quantity.</span>}
            </div>
          )}

          {error && <p className="alert alert--danger">{error}</p>}
          {saved && <p className="alert alert--ok">{saved}</p>}

          <button className="btn btn--primary" disabled={busy || !product}>
            {busy ? 'Saving…' : 'Save movement'}
          </button>
        </form>
      )}
    </Screen>
  )
}
