 import { api } from "./api";

export type Product = { id: string; name: string; sku?: string; unit_cost?: number };
export type ProductWithStock = Product & { stock: number | null };

type StockResponse = { stock?: number; current_stock?: number };

export async function fetchProducts(): Promise<Product[]> {
  const data = await api<Product[] | { products: Product[] }>("/api/products");
  return Array.isArray(data) ? data : data.products ?? [];
}

export async function fetchStock(id: string): Promise<number | null> {
  try {
    const s = await api<StockResponse>(`/api/products/${id}/stock`);
    return s.stock ?? s.current_stock ?? null;
  } catch {
    return null;
  }
}

export async function fetchProductsWithStock(): Promise<ProductWithStock[]> {
  const products = await fetchProducts();
  return Promise.all(products.map(async (p) => ({ ...p, stock: await fetchStock(p.id) })));
}

export function formatRWF(n: number) {
  return `${Math.round(n).toLocaleString()} RWF`;
}

export const LOW_STOCK = 5;

export function stockStatus(stock: number | null) {
  if (stock === null) return { label: "No data", cls: "badge" };
  if (stock <= 0) return { label: "Out of stock", cls: "badge out" };
  if (stock <= LOW_STOCK) return { label: "Low stock", cls: "badge low" };
  return { label: "In stock", cls: "badge ok" };
}

export type Difference = {
  product_id: string;
  name: string;
  expected: number;
  counted: number;
  variance: number;
  unit_cost: number;
};

// variance = counted - expected (negative = shortage, positive = surplus)
export function variance(counted: number, expected: number) {
  return counted - expected;
}
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { fetchProductsWithStock, formatRWF, stockStatus, LOW_STOCK, type ProductWithStock } from "../products";

type Filter = "all" | "low" | "out";

export default function Products() {
  const [rows, setRows] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unitCost, setUnitCost] = useState("");

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
    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify({ name, sku: sku || undefined, unit_cost: Number(unitCost) }),
      });
      setName(""); setSku(""); setUnitCost(""); setShowForm(false);
      load();
    } catch {
      setError("Could not add the product.");
    }
  }

  const isLow = (r: ProductWithStock) => r.stock !== null && r.stock > 0 && r.stock <= LOW_STOCK;
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
          const status = stockStatus(r.stock);
          return (
            <div className="row" key={r.id}>
              <div>
                <div className="row-title">{r.name}</div>
                <div className="row-sub">
                  {r.sku ?? "No SKU"}{r.unit_cost !== undefined ? ` · ${formatRWF(r.unit_cost)} / unit` : ""}
                </div>
              </div>
              <div className="row-right">
                <div className="row-title">{r.stock ?? "—"} units</div>
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
          <label className="field"><span>Unit cost (RWF)</span>
            <input className="input" type="number" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required /></label>
          <button className="btn btn-primary" type="submit">Save product</button>
        </form>
      )}

      <button className="btn btn-primary sticky" onClick={() => setShowForm(!showForm)}>
        {showForm ? "Cancel" : "+ Add product"}
      </button>
    </>
  );
}