import { api, getClaims } from "./api";

// Matches product_to_dict() in backend/app/routes/products.py.
// unit_cost is not stored by the backend yet; it is kept optional so the UI
// starts showing RWF values as soon as the API returns it.
export type Product = {
  id: string;
  business_id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  quantity_on_hand: number;
  reorder_level: number | null;
  unit_cost?: number;
};

// `stock` comes from GET /api/products/<id>/stock (sum of recorded movements).
export type ProductWithStock = Product & { stock: number | null };

export type NewProduct = {
  name: string;
  sku?: string;
  unit?: string;
  quantity_on_hand?: number;
  reorder_level?: number;
};

type StockResponse = { product_id: string; name: string; stock: number };

export async function fetchProducts(): Promise<Product[]> {
  const products = await api<Product[]>("/api/products");
  // GET /api/products is not filtered by business on the server, so only keep our own.
  const businessId = getClaims()?.business_id;
  return businessId ? products.filter((p) => p.business_id === businessId) : products;
}

export async function fetchStock(id: string): Promise<number | null> {
  try {
    const s = await api<StockResponse>(`/api/products/${id}/stock`);
    return s.stock;
  } catch {
    return null;
  }
}

export async function fetchProductsWithStock(): Promise<ProductWithStock[]> {
  const products = await fetchProducts();
  return Promise.all(products.map(async (p) => ({ ...p, stock: await fetchStock(p.id) })));
}

export function createProduct(product: NewProduct) {
  return api<Product>("/api/products", {
    method: "POST",
    body: JSON.stringify({ ...product, business_id: getClaims()?.business_id }),
  });
}

export function formatRWF(n: number) {
  return `${Math.round(n).toLocaleString()} RWF`;
}

// Used when a product has no reorder level set.
export const LOW_STOCK = 5;

export function isLowStock(stock: number | null, reorderLevel?: number | null) {
  return stock !== null && stock > 0 && stock <= (reorderLevel || LOW_STOCK);
}

export function stockStatus(stock: number | null, reorderLevel?: number | null) {
  if (stock === null) return { label: "No data", cls: "badge" };
  if (stock <= 0) return { label: "Out of stock", cls: "badge out" };
  if (isLowStock(stock, reorderLevel)) return { label: "Low stock", cls: "badge low" };
  return { label: "In stock", cls: "badge ok" };
}

export type Difference = {
  product_id: string;
  discrepancy_id: string | null;
  name: string;
  expected: number;
  counted: number;
  variance: number;
  unit_cost: number;
};

// variance = counted - expected (negative = shortage, positive = surplus)
// Same rule as backend/app/services/variance.py.
export function variance(counted: number, expected: number) {
  return counted - expected;
}
