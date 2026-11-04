import { useEffect, useState } from "react";
import { api } from "../api";
import { fetchProductsWithStock, formatRWF } from "../products";

type Line = { key: string; name: string; quantity: number; value: number };

type ValuationResponse = {
  total_value?: number;
  total?: number;
  products?: { name: string; quantity?: number; stock?: number; value?: number }[];
  items?: { name: string; quantity?: number; stock?: number; value?: number }[];
};

export default function InventoryValue() {
  const [lines, setLines] = useState<Line[]>([]);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const d = await api<ValuationResponse>("/api/reports/valuation");
        // Not implemented on the backend yet; the fallback below is used until it is.
        const items = (d.products ?? d.items ?? []).map((p, i) => ({
          key: `${p.name}-${i}`,
          name: p.name,
          quantity: p.quantity ?? p.stock ?? 0,
          value: p.value ?? 0,
        }));
        setLines(items);
        setTotal(d.total_value ?? d.total ?? items.reduce((s, x) => s + x.value, 0));
        setSource("From the valuation report API");
      } catch {
        try {
          const products = await fetchProductsWithStock();
          const items = products.map((p) => {
            const qty = p.stock ?? 0;
            return { key: p.id, name: p.name, quantity: qty, value: qty * (p.unit_cost ?? 0) };
          });
          setLines(items);
          setTotal(items.reduce((s, x) => s + x.value, 0));
          setSource(products.some((p) => p.unit_cost !== undefined)
            ? "Calculated from current stock × unit cost"
            : "Unit costs are not stored by the backend yet, so values show 0");
        } catch {
          setError("Could not load inventory value. Is the backend running?");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const outOfStock = lines.filter((l) => l.quantity <= 0);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  function shareWhatsApp() {
    const text = `StockWise inventory value (${today}): ${formatRWF(total)} across ${lines.length} products.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  if (loading) return <p className="hint center">Loading...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <>
      <div className="total-card">
        <div className="total-label">Total stock value · {today}</div>
        <div className="total-value">{formatRWF(total)}</div>
        <div className="total-sub">{lines.length} products · {source}</div>
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th>Product</th><th>Qty</th><th>Value (RWF)</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}><td>{l.name}</td><td>{l.quantity}</td><td>{Math.round(l.value).toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
        {lines.length === 0 && <p className="hint center">No products yet.</p>}
      </div>

      {outOfStock.map((l) => (
        <div className="alert" key={l.key}>{l.name} is out of stock. Restock before your lender visit.</div>
      ))}

      <div className="actions no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>Download PDF for lender</button>
        <button className="btn btn-secondary" onClick={shareWhatsApp}>Share via WhatsApp</button>
      </div>
    </>
  );
}