import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, toFormError } from '../api'
import type { FormError } from '../api'
import { FieldError, FormAlert } from '../components/FieldError'
import { Screen } from '../components/Screen'

const PRODUCT_FIELDS = ['name', 'sku', 'unit', 'unit_cost', 'reorder_level']

// Edit a product's details. Stock is not on this form: it only changes
// through movements and approved counts, so the ledger stays the record.
export function EditProductPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [reorderLevel, setReorderLevel] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<FormError | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .getProduct(id)
      .then((p) => {
        if (cancelled) return
        setName(p.name)
        setSku(p.sku ?? '')
        setUnit(p.unit ?? '')
        setUnitCost(String(p.unit_cost))
        setReorderLevel(String(p.reorder_level))
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toFormError(err, 'Could not load the product').message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.updateProduct(id, {
        name: name.trim(),
        sku: sku.trim(),
        unit: unit.trim(),
        unit_cost: Number(unitCost),
        reorder_level: Number(reorderLevel),
      })
      navigate('/products')
    } catch (err) {
      setError(toFormError(err, 'Could not save the product'))
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Screen title="Edit product">
        <p className="muted">Loading product…</p>
      </Screen>
    )
  }

  if (loadError) {
    return (
      <Screen title="Edit product">
        <p className="alert alert--danger">{loadError}</p>
        <Link className="btn btn--secondary" to="/products">Back to products</Link>
      </Screen>
    )
  }

  return (
    <Screen title="Edit product">
      <form className="card stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
          <FieldError error={error} field="name" />
        </label>
        <div className="two-col">
          <label className="field">
            <span>SKU (optional)</span>
            <input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={60} />
            <FieldError error={error} field="sku" />
          </label>
          <label className="field">
            <span>Unit (optional)</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} />
            <FieldError error={error} field="unit" />
          </label>
        </div>
        <div className="two-col">
          <label className="field">
            <span>Cost per unit (RWF)</span>
            <input type="number" inputMode="numeric" min={0} step={1} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
            <FieldError error={error} field="unit_cost" />
          </label>
          <label className="field">
            <span>Low stock at</span>
            <input type="number" inputMode="numeric" min={0} step={1} value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} required />
            <FieldError error={error} field="reorder_level" />
          </label>
        </div>
        <p className="muted small">To change the stock, record a movement or do a count.</p>
        <FormAlert error={error} fields={PRODUCT_FIELDS} />
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <Link className="btn btn--secondary" to="/products">Cancel</Link>
      </form>
    </Screen>
  )
}
