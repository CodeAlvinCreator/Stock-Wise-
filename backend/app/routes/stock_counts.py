from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import Discrepancy, Product, StockCount, User
from app.services.variance import calculate_variance

stock_counts_bp = Blueprint("stock_counts", __name__)


@stock_counts_bp.route("/api/counts", methods=["POST"])
@jwt_required()
def create_count():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    counted = data.get("counted_quantity")

    if not product_id:
        return jsonify({"error": "product_id is required"}), 400
    if isinstance(counted, bool) or not isinstance(counted, int) or counted < 0:
        return jsonify({"error": "counted_quantity must be a whole number, 0 or more"}), 400

    user = db.session.get(User, get_jwt_identity())
    if user is None:
        return jsonify({"error": "user not found"}), 401

    product = db.session.get(Product, product_id)
    if product is None or product.business_id != user.business_id:
        return jsonify({"error": "product not found"}), 404

    expected = product.quantity_on_hand
    result = calculate_variance(expected, counted)

    count = StockCount(
        product_id=product.id,
        user_id=user.id,
        expected_quantity=expected,
        counted_quantity=counted,
    )
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

    db.session.commit()

    return jsonify({
        "count": {
            "id": count.id,
            "product_id": product.id,
            "expected_quantity": expected,
            "counted_quantity": counted,
        },
        "kind": result["kind"],
        "discrepancy": None if discrepancy is None else {
            "id": discrepancy.id,
            "difference": discrepancy.difference,
            "status": discrepancy.status,
        },
    }), 201