import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { fetchProductsWithStock, type ProductWithStock } from "../products";

const TYPES = [
  { value: "purchase", label: "Purchase", sign: 1 },
  { value: "sale", label: "Sale", sign: -1 },
  { value: "return", label: "Return", sign: 1 },
  { value: "damage", label: "Damage", sign: -1 },
];

export default function StockMovements() {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("purchase");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setProducts(await fetchProductsWithStock());
    } catch {
      setError("Could not load products. Is the backend running?");
    }
  }

  useEffect(() => { load(); }, []);

  const product = products.find((p) => p.id === productId);
  const sign = TYPES.find((t) => t.value === type)?.sign ?? 1;
  const qty = Number(quantity) || 0;
  const current = product?.stock ?? null;
  const after = current !== null ? current + sign * qty : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Quantity must be a whole number above 0.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/movements", {
        method: "POST",
        body: JSON.stringify({ product_id: productId, movement_type: type, quantity: qty, note: note || undefined }),
      });
      setMessage(`Saved: ${type} of ${qty} × ${product?.name ?? "product"}.`);
      setQuantity("");
      setNote("");
      load();
    } catch (err) {
      setError(err instanceof Error ? `Could not save the movement: ${err.message}` : "Could not save the movement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="field">
        <span>Product</span>
        <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} required>
          <option value="">Choose a product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.stock !== null ? ` (${p.stock} in stock)` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Type</span>
        <div className="chips">
          {TYPES.map((t) => (
            <button type="button" key={t.value}
              className={type === t.value ? "chip active" : "chip"}
              onClick={() => setType(t.value)}>{t.label}</button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Quantity (units)</span>
        <input className="input" type="number" min="1" step="1" value={quantity}
          onChange={(e) => setQuantity(e.target.value)} required />
      </label>

      <label className="field">
        <span>Note</span>
        <input className="input" placeholder="e.g. Delivery from wholesaler" value={note} maxLength={255}
          onChange={(e) => setNote(e.target.value)} />
      </label>

      {product && after !== null && qty > 0 && (
        <div className="preview">
          <div className="preview-label">Stock after saving</div>
          <div className="preview-value">{current} → {after} units</div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save movement"}
      </button>
    </form>
  );
}