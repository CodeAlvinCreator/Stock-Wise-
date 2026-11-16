"""Financial reports for the loan-readiness feature.

GET /api/reports/valuation
    Total inventory value for the logged-in owner's business:
        total value = sum over products of (current stock x unit cost)

    Current stock is never read from Product.quantity_on_hand. It is
    recalculated from the stock_movements ledger, the same rule used by the
    movements API: purchases and returns add stock, sales and damage remove it.
    A lender can trust a ledger total more than a number anyone can overwrite.
"""

from datetime import datetime, timezone

from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import Product, User
from app.services.stock import stock_by_product

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

CURRENCY = "RWF"


def build_valuation(business_id):
    """Build the valuation report as a plain dict (easy to unit test and to
    reuse later inside the loan-readiness PDF)."""
    products = (
        Product.query.filter_by(business_id=business_id).order_by(Product.name).all()
    )
    stock = stock_by_product(business_id)

    items = []
    negative_stock = []
    total_value = 0

    for product in products:
        quantity = stock.get(product.id, 0)
        unit_cost = product.unit_cost or 0

        # A negative balance means more sales or damage were recorded than
        # stock ever came in. That is a record-keeping error, not stock that
        # has value, so it counts as 0 and is listed for the owner to fix.
        if quantity < 0:
            negative_stock.append(product.id)
            value = 0
        else:
            value = quantity * unit_cost

        total_value += value
        items.append(
            {
                "product_id": product.id,
                "name": product.name,
                "sku": product.sku,
                "unit": product.unit,
                "stock": quantity,
                "unit_cost": unit_cost,
                "value": value,
            }
        )

    missing_cost = [item["product_id"] for item in items if item["unit_cost"] == 0]

    return {
        "business_id": business_id,
        "currency": CURRENCY,
        "total_value": total_value,
        "product_count": len(items),
        "items": items,
        "warnings": {
            "negative_stock": negative_stock,
            "missing_unit_cost": missing_cost,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@reports_bp.get("/valuation")
@jwt_required()
def valuation():
    user = db.session.get(User, get_jwt_identity())
    if user is None:
        return jsonify(error="user not found"), 401

    # Inventory value is financial data for loan applications, so only the
    # business owner can see it. The role is read from the database rather
    # than the token, so a demoted user loses access straight away.
    if user.role != "owner":
        return jsonify(error="only the business owner can view the valuation report"), 403

    return jsonify(build_valuation(user.business_id)), 200
