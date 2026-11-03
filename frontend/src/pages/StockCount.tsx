import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { fetchProductsWithStock, variance, type Difference, type ProductWithStock } from "../products";

export default function StockCount() {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProductsWithStock()
      .then(setProducts)
      .catch(() => setError("Could not load products. Is the backend running?"));
  }, []);

  const counted = products.filter((p) => counts[p.id] !== undefined && counts[p.id] !== "");
  const differences: Difference[] = counted
    .map((p) => {
      const c = Number(counts[p.id]);
      const expected = p.stock ?? 0;
      return { product_id: p.id, name: p.name, expected, counted: c, variance: variance(c, expected), unit_cost: p.unit_cost ?? 0 };
    })
    .filter((d) => d.variance !== 0);

  function statusFor(p: ProductWithStock) {
    const value = counts[p.id];
    if (value === undefined || value === "") return <span className="row-sub">Not counted yet</span>;
    const v = variance(Number(value), p.stock ?? 0);
    if (v === 0) return <span className="row-sub ok-text">Matches</span>;
    if (v < 0) return <span className="row-sub bad-text">Shortage of {-v}</span>;
    return <span className="row-sub warn-text">Surplus of {v}</span>;
  }

  async function finish() {
    setError("");
    setSaving(true);
    try {
      await api("/api/counts", {
        method: "POST",
        body: JSON.stringify({
          counts: counted.map((p) => ({ product_id: p.id, counted_quantity: Number(counts[p.id]) })),
        }),
      });
      sessionStorage.setItem("lastCountDifferences", JSON.stringify(differences));
      navigate(differences.length > 0 ? "/investigate" : "/products");
    } catch {
      setError("Could not save the count.");
    } finally {
      setSaving(false);
    }
  }

  const progress = products.length ? (counted.length / products.length) * 100 : 0;

  return (
    <>
      <div className="progress-card">
        <div className="progress-text">{counted.length} of {products.length} products counted</div>
        <div className="progress-bar"><div style={{ width: `${progress}%` }} /></div>
      </div>
      <p className="hint">Count what is physically on the shelf. Don't look at the expected number first.</p>

      {error && <p className="error">{error}</p>}

      <div className="list">
        {products.map((p) => (
          <div className="row" key={p.id}>
            <div>
              <div className="row-title">{p.name}</div>
              <div className="row-sub">Expected: {p.stock ?? "—"} units</div>
              {statusFor(p)}
            </div>
            <input className="input count-input" type="number" min="0" inputMode="numeric"
              value={counts[p.id] ?? ""} placeholder="–"
              onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} />
          </div>
        ))}
      </div>

      <button className="btn btn-primary sticky" onClick={finish} disabled={saving || counted.length === 0}>
        {saving ? "Saving..." : `Finish count (${differences.length} difference${differences.length === 1 ? "" : "s"})`}
      </button>
    </>
  );
}