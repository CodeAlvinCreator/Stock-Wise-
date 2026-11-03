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