import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, formatRwf, toFormError } from '../api'
import type { FormError } from '../api'
import { FieldError, FormAlert } from '../components/FieldError'
import { Screen } from '../components/Screen'
import { StockBadge } from '../components/StockBadge'
import { useProducts } from '../useProducts'

type Filter = 'all' | 'low' | 'out'

export function ProductsPage() {
  const { products, loading, error, reload } = useProducts()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showForm, setShowForm] = useState(false)

  // Same rule as StockBadge: low means at or below the reorder level, but not empty
  const low = products.filter((p) => p.stock > 0 && p.stock <= p.reorder_level)
  const out = products.filter((p) => p.stock <= 0)
  const term = search.trim().toLowerCase()
  const visible = (filter === 'low' ? low : filter === 'out' ? out : products).filter(
    (p) => !term || p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term),
  )

  return (
    <Screen title="Products">
      <label className="field">
        <span>Search</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or SKU" />
      </label>

      <div className="pills" role="group" aria-label="Filter products">
        <Pill active={filter === 'all'} onClick={() => setFilter('all')} label={`All (${products.length})`} />
        <Pill active={filter === 'low'} onClick={() => setFilter('low')} label={`Low stock (${low.length})`} />
        <Pill active={filter === 'out'} onClick={() => setFilter('out')} label={`Out of stock (${out.length})`} />
      </div>

      {low.length + out.length > 0 && filter === 'all' && (
        <p className="alert alert--warn">
          {low.length + out.length} product{low.length + out.length === 1 ? ' is' : 's are'} at or below the reorder
          level. Restock soon.
        </p>
      )}

      {error && <p className="alert alert--danger">{error}</p>}
      {loading && <p className="muted">Loading products…</p>}
      {!loading && !error && products.length === 0 && (
        <p className="muted">No products yet. Add your first one below.</p>
      )}

      {visible.map((p) => (
        <Link key={p.id} to={`/movements?product=${p.id}`} className="row">
          <div className="row__info">
            <strong>{p.name}</strong>
            <span className="muted small">
              {[p.sku, `${formatRwf(p.unit_cost)} / ${p.unit || 'unit'}`].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="row__stock">
            <strong>
              {p.stock} {p.unit || 'units'}
            </strong>
            <StockBadge stock={p.stock} reorderLevel={p.reorder_level} />
          </div>
        </Link>
      ))}
      {!loading && products.length > 0 && visible.length === 0 && <p className="muted">No products match.</p>}

      {showForm ? (
        <AddProductForm
          onDone={() => {
            setShowForm(false)
            reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button className="btn btn--primary" onClick={() => setShowForm(true)}>
          + Add product
        </button>
      )}
    </Screen>
  )
}

function Pill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`pill${active ? ' pill--active' : ''}`} aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  )
}

const PRODUCT_FIELDS = ['name', 'sku', 'unit', 'unit_cost', 'reorder_level']

function AddProductForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [reorderLevel, setReorderLevel] = useState('5')
  const [error, setError] = useState<FormError | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.createProduct({
        name: name.trim(),
        sku: sku.trim() || undefined,
        unit: unit.trim() || undefined,
        unit_cost: Number(unitCost),
        reorder_level: Number(reorderLevel),
      })
      onDone()
    } catch (err) {
      setError(toFormError(err, 'Could not save the product'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <h2 className="card__title">New product</h2>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} placeholder="Sugar 1kg" />
        <FieldError error={error} field="name" />
      </label>
      <div className="two-col">
        <label className="field">
          <span>SKU (optional)</span>
          <input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={60} placeholder="SUG-001" />
          <FieldError error={error} field="sku" />
        </label>
        <label className="field">
          <span>Unit (optional)</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} placeholder="bags" />
          <FieldError error={error} field="unit" />
        </label>
      </div>
      <div className="two-col">
        <label className="field">
          <span>Cost per unit (RWF)</span>
          <input type="number" inputMode="numeric" min={0} step={1} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required placeholder="1500" />
          <FieldError error={error} field="unit_cost" />
        </label>
        <label className="field">
          <span>Low stock at</span>
          <input type="number" inputMode="numeric" min={0} step={1} value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} required />
          <FieldError error={error} field="reorder_level" />
        </label>
      </div>
      <FormAlert error={error} fields={PRODUCT_FIELDS} />
      <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
      <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
    </form>
  )
}
