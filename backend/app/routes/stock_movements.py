from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func

from app import db
from app.models import Product, StockMovement, User

bp = Blueprint("stock_movements", __name__, url_prefix="/api")

# +1 adds stock, -1 removes stock.
MOVEMENT_SIGNS = {
    "purchase": 1,
    "return": 1,
    "sale": -1,
    "damage": -1,
}


def _current_user():
    return db.session.get(User, get_jwt_identity())


def _product_for(user, product_id):
    """Return the product only if it belongs to the user's business."""
    product = db.session.get(Product, product_id)
    if product is None or product.business_id != user.business_id:
        return None
    return product


def current_stock(product_id):
    """Stock = sum of signed movements (purchase/return +, sale/damage -)."""
    total = (
        db.session.query(
            func.coalesce(
                func.sum(
                    db.case(
                        *[
                            (StockMovement.movement_type == t, StockMovement.quantity * s)
                            for t, s in MOVEMENT_SIGNS.items()
                        ],
                        else_=0,
                    )
                ),
                0,
            )
        )
        .filter(StockMovement.product_id == product_id)
        .scalar()
    )
    return int(total)


@bp.route("/movements", methods=["POST"])
@jwt_required()
def create_movement():
    user = _current_user()
    if user is None:
        return jsonify(error="user not found"), 401

    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    movement_type = data.get("movement_type")
    quantity = data.get("quantity")
    note = data.get("note")

    if not product_id:
        return jsonify(error="product_id is required"), 400
    if movement_type not in MOVEMENT_SIGNS:
        return jsonify(
            error=f"movement_type must be one of: {', '.join(MOVEMENT_SIGNS)}"
        ), 400
    # bool is a subclass of int in Python, so reject it explicitly.
    if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity <= 0:
        return jsonify(error="quantity must be a positive integer"), 400
    if note is not None and (not isinstance(note, str) or len(note) > 255):
        return jsonify(error="note must be a string of at most 255 characters"), 400

    if _product_for(user, product_id) is None:
        return jsonify(error="product not found"), 404

    movement = StockMovement(
        product_id=product_id,
        user_id=user.id,
        movement_type=movement_type,
        quantity=quantity,
        note=note,
    )
    db.session.add(movement)
    db.session.commit()

    return (
        jsonify(
            id=movement.id,
            product_id=movement.product_id,
            movement_type=movement.movement_type,
            quantity=movement.quantity,
            note=movement.note,
            created_at=movement.created_at.isoformat(),
        ),
        201,
    )


@bp.route("/products/<product_id>/stock", methods=["GET"])
@jwt_required()
def get_product_stock(product_id):
    user = _current_user()
    if user is None:
        return jsonify(error="user not found"), 401

    product = _product_for(user, product_id)
    if product is None:
        return jsonify(error="product not found"), 404

    return jsonify(product_id=product.id, name=product.name, stock=current_stock(product.id))
