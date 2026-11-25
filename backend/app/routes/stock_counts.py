from flask import Blueprint, abort, jsonify
from flask_jwt_extended import current_user, jwt_required

from app import db
from app.models import Discrepancy, Product, StockCount
from app.routes.products import get_business_product
from app.services.stock import current_stock
from app.services.audit import log_action
from app.services.validation import json_body, read_int, read_string, read_uuid
from app.services.variance import calculate_variance

stock_counts_bp = Blueprint("stock_counts", __name__)


def _count_json(count, discrepancy):
    return {
        "count": {
            "id": count.id,
            "product_id": count.product_id,
            "expected_quantity": count.expected_quantity,
            "counted_quantity": count.counted_quantity,
        },
        "kind": calculate_variance(count.expected_quantity, count.counted_quantity)["kind"],
        "discrepancy": None if discrepancy is None else {
            "id": discrepancy.id,
            "difference": discrepancy.difference,
            "status": discrepancy.status,
        },
    }


@stock_counts_bp.route("/api/counts", methods=["POST"])
@jwt_required()
def create_count():
    data = json_body()
    product_id = read_string(data, "product_id", 36, required=True)
    counted = read_int(data, "counted_quantity")
    # Optional id made on the phone, the same replay-safe pattern as movements.
    count_id = read_uuid(data, "id")
    product = get_business_product(product_id)
    user = current_user

    if count_id is not None:
        existing = db.session.get(StockCount, count_id)
        if existing is not None:
            owner = db.session.get(Product, existing.product_id)
            if owner.business_id != user.business_id:
                abort(409, description="id already used")
            # A replayed request: return the saved count and its discrepancy,
            # without a second discrepancy or audit row.
            saved = Discrepancy.query.filter_by(stock_count_id=existing.id).first()
            return jsonify(_count_json(existing, saved)), 200

    # Expected stock comes from the movement ledger, never quantity_on_hand.
    expected = current_stock(product.id)
    result = calculate_variance(expected, counted)

    count = StockCount(
        product_id=product.id,
        user_id=user.id,
        expected_quantity=expected,
        counted_quantity=counted,
    )
    if count_id is not None:
        count.id = count_id
    db.session.add(count)
    db.session.flush()

    discrepancy = None
    if result["difference"] != 0:
        discrepancy = Discrepancy(
            stock_count_id=count.id,
            product_id=product.id,
            difference=result["difference"],
        )
        db.session.add(discrepancy)

    log_action(
        user,
        "count.created",
        "count",
        count.id,
        {
            "product_id": product.id,
            "expected": expected,
            "counted": counted,
            "difference": result["difference"],
        },
    )
    db.session.commit()

    return jsonify(_count_json(count, discrepancy)), 201
