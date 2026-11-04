import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { createProduct, fetchProductsWithStock, formatRWF, isLowStock, stockStatus, type ProductWithStock } from "../products";

type Filter = "all" | "low" | "out";

export default function Products() {
  const [rows, setRows] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchProductsWithStock());
    } catch {
      setError("Could not load products. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const opening = Number(openingStock) || 0;
    try {
      const product = await createProduct({
        name,
        sku: sku || undefined,
        unit: unit || undefined,
        quantity_on_hand: opening,
        reorder_level: Number(reorderLevel) || 0,
      });
      // Stock is the sum of movements, so record the opening stock as a purchase.
      if (opening > 0) {
        await api("/api/movements", {
          method: "POST",
          body: JSON.stringify({ product_id: product.id, movement_type: "purchase", quantity: opening, note: "Opening stock" }),
        });
      }
      setName(""); setSku(""); setUnit(""); setOpeningStock(""); setReorderLevel(""); setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? `Could not add the product: ${err.message}` : "Could not add the product.");
    } finally {
      setSaving(false);
    }
  }

  const isLow = (r: ProductWithStock) => isLowStock(r.stock, r.reorder_level);
  const isOut = (r: ProductWithStock) => r.stock !== null && r.stock <= 0;

  const lowCount = rows.filter(isLow).length;
  const outCount = rows.filter(isOut).length;

  const visible = rows
    .filter((r) => filter === "all" || (filter === "low" ? isLow(r) : isOut(r)))
    .filter((r) => {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || (r.sku ?? "").toLowerCase().includes(q);
    });

  return (
    <>
      <label className="field">
        <span>Search</span>
        <input className="input" placeholder="Search by name or SKU" value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </label>

      <div className="chips">
        <button className={filter === "all" ? "chip active" : "chip"} onClick={() => setFilter("all")}>All ({rows.length})</button>
        <button className={filter === "low" ? "chip active" : "chip"} onClick={() => setFilter("low")}>Low stock ({lowCount})</button>
        <button className={filter === "out" ? "chip active" : "chip"} onClick={() => setFilter("out")}>Out of stock ({outCount})</button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint center">Loading...</p>}

      <div className="list">
        {visible.map((r) => {
          const status = stockStatus(r.stock, r.reorder_level);
          return (
            <div className="row" key={r.id}>
              <div>
                <div className="row-title">{r.name}</div>
                <div className="row-sub">
                  {r.sku || "No SKU"}{r.unit_cost !== undefined ? ` · ${formatRWF(r.unit_cost)} / unit` : ""}
                </div>
              </div>
              <div className="row-right">
                <div className="row-title">{r.stock ?? "—"} {r.unit || "units"}</div>
                <span className={status.cls}>{status.label}</span>
              </div>
            </div>
          );
        })}
        {!loading && !error && visible.length === 0 && (
          <p className="hint center">No products here yet.</p>
        )}
      </div>

      {showForm && (
        <form className="card form" onSubmit={handleAdd}>
          <label className="field"><span>Product name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="field"><span>SKU (optional)</span>
            <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} /></label>
          <label className="field"><span>Unit (optional)</span>
            <input className="input" placeholder="e.g. bags, kg, bottles" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
          <label className="field"><span>Opening stock</span>
            <input className="input" type="number" min="0" step="1" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} /></label>
          <label className="field"><span>Reorder level (optional)</span>
            <input className="input" type="number" min="0" step="1" placeholder="Warn when stock is at or below this"
              value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} /></label>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save product"}</button>
        </form>
      )}

      <button className="btn btn-primary sticky" onClick={() => setShowForm(!showForm)}>
        {showForm ? "Cancel" : "+ Add product"}
      </button>
    </>
  );
}
