from sqlalchemy import case, func

from app import db
from app.models import Product, StockMovement

# +1 adds stock, -1 removes stock.
MOVEMENT_SIGNS = {
    "purchase": 1,
    "return": 1,
    "sale": -1,
    "damage": -1,
    "adjustment_in": 1,
    "adjustment_out": -1,
}

# Adjustments are only created by owner approvals, never through the public API.
PUBLIC_MOVEMENT_TYPES = ("purchase", "return", "sale", "damage")


def _signed_quantity():
    """SQL expression: each movement's quantity multiplied by its sign."""
    return case(
        *[
            (StockMovement.movement_type == movement_type, StockMovement.quantity * sign)
            for movement_type, sign in MOVEMENT_SIGNS.items()
        ],
        else_=0,
    )


def current_stock(product_id):
    """Stock = sum of signed movements (purchase/return/adjustment_in +, the rest -)."""
    total = (
        db.session.query(func.coalesce(func.sum(_signed_quantity()), 0))
        .filter(StockMovement.product_id == product_id)
        .scalar()
    )
    return int(total)


def stock_by_product(business_id):
    """Return {product_id: current_stock} for every product in one business.

    Uses a single GROUP BY query instead of one query per product, so the
    report stays fast when a shop has hundreds of products.
    """
    rows = (
        db.session.query(StockMovement.product_id, func.sum(_signed_quantity()))
        .join(Product, Product.id == StockMovement.product_id)
        .filter(Product.business_id == business_id)
        .group_by(StockMovement.product_id)
        .all()
    )
    return {product_id: int(total or 0) for product_id, total in rows}
