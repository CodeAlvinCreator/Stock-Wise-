// Green "In stock", amber "Low stock", red "Out of stock".
// Low means at or below the product's reorder level.
export function StockBadge({ stock, reorderLevel }: { stock: number; reorderLevel: number }) {
  if (stock <= 0) return <span className="badge badge--danger">Out of stock</span>
  if (stock <= reorderLevel) return <span className="badge badge--warn">Low stock</span>
  return <span className="badge badge--ok">In stock</span>
}
