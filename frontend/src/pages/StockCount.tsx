import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { fetchProducts, variance, type Difference, type Product } from "../products";

// POST /api/counts response (backend/app/routes/stock_counts.py).
type CountResponse = {
  count: { id: string; product_id: string; expected_quantity: number; counted_quantity: number };
  kind: "shortage" | "surplus" | "match";
  discrepancy: { id: string; difference: number; status: string } | null;
};

export default function StockCount() {
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Differences already saved, kept if some products failed so a retry doesn't save them twice.
  const [saved, setSaved] = useState<Difference[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProducts()
      .then(setProducts)
      .catch(() => setError("Could not load products. Is the backend running?"));
  }, []);

  // The backend compares the count with quantity_on_hand, so that is the expected number.
  const counted = products.filter((p) => counts[p.id] !== undefined && counts[p.id] !== "");
  const invalid = counted.filter((p) => {
    const n = Number(counts[p.id]);
    return !Number.isInteger(n) || n < 0;
  });
  const differenceCount = counted.filter((p) => variance(Number(counts[p.id]), p.quantity_on_hand) !== 0).length;

  function statusFor(p: Product) {
    const value = counts[p.id];
    if (value === undefined || value === "") return <span className="row-sub">Not counted yet</span>;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) return <span className="row-sub bad-text">Enter a whole number, 0 or more</span>;
    const v = variance(n, p.quantity_on_hand);
    if (v === 0) return <span className="row-sub ok-text">Matches</span>;
    if (v < 0) return <span className="row-sub bad-text">Shortage of {-v}</span>;
    return <span className="row-sub warn-text">Surplus of {v}</span>;
  }

  async function finish() {
    setError("");
    setSaving(true);
    const differences: Difference[] = [...saved];
    const failed: string[] = [];
    const remaining: Record<string, string> = {};
    // One request per product: the endpoint records a single count each time.
    for (const p of counted) {
      try {
        const res = await api<CountResponse>("/api/counts", {
          method: "POST",
          body: JSON.stringify({ product_id: p.id, counted_quantity: Number(counts[p.id]) }),
        });
        if (res.discrepancy) {
          differences.push({
            product_id: p.id,
            discrepancy_id: res.discrepancy.id,
            name: p.name,
            expected: res.count.expected_quantity,
            counted: res.count.counted_quantity,
            variance: res.discrepancy.difference,
            unit_cost: p.unit_cost ?? 0,
          });
        }
      } catch {
        failed.push(p.name);
        remaining[p.id] = counts[p.id];
      }
    }
    setSaving(false);
    sessionStorage.setItem("lastCountDifferences", JSON.stringify(differences));
    if (failed.length > 0) {
      setSaved(differences);
      setCounts(remaining);
      setError(`Could not save the count for: ${failed.join(", ")}. The others were saved; try again.`);
      return;
    }
    navigate(differences.length > 0 ? "/investigate" : "/products");
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
              <div className="row-sub">Expected: {p.quantity_on_hand} {p.unit || "units"}</div>
              {statusFor(p)}
            </div>
            <input className="input count-input" type="number" min="0" step="1" inputMode="numeric"
              value={counts[p.id] ?? ""} placeholder="–"
              onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} />
          </div>
        ))}
      </div>

      <button className="btn btn-primary sticky" onClick={finish}
        disabled={saving || counted.length === 0 || invalid.length > 0}>
        {saving ? "Saving..." : `Finish count (${differenceCount} difference${differenceCount === 1 ? "" : "s"})`}
      </button>
    </>
  );
}
