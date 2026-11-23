import uuid

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import Product, StockMovement, User
from app.services.stock import PUBLIC_MOVEMENT_TYPES, current_stock

bp = Blueprint("stock_movements", __name__, url_prefix="/api")


def _current_user():
    return db.session.get(User, get_jwt_identity())


def _product_for(user, product_id):
    """Return the product only if it belongs to the user's business."""
    product = db.session.get(Product, product_id)
    if product is None or product.business_id != user.business_id:
        return None
    return product


def _parse_uuid(value):
    """Return the canonical UUID string, or None if value is not a valid UUID."""
    if not isinstance(value, str):
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


def _movement_json(movement):
    return dict(
        id=movement.id,
        product_id=movement.product_id,
        movement_type=movement.movement_type,
        quantity=movement.quantity,
        note=movement.note,
        created_at=movement.created_at.isoformat(),
    )


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
    # Optional id made on the phone, so a replayed offline request is recognised.
    client_id = data.get("id")

    if not product_id:
        return jsonify(error="product_id is required"), 400
    if movement_type not in PUBLIC_MOVEMENT_TYPES:
        return jsonify(
            error=f"movement_type must be one of: {', '.join(PUBLIC_MOVEMENT_TYPES)}"
        ), 400
    # bool is a subclass of int in Python, so reject it explicitly.
    if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity <= 0:
        return jsonify(error="quantity must be a positive integer"), 400
    if note is not None and (not isinstance(note, str) or len(note) > 255):
        return jsonify(error="note must be a string of at most 255 characters"), 400

    movement_id = None
    if client_id is not None:
        movement_id = _parse_uuid(client_id)
        if movement_id is None:
            return jsonify(error="id must be a valid UUID"), 400

    if _product_for(user, product_id) is None:
        return jsonify(error="product not found"), 404

    if movement_id is not None:
        existing = db.session.get(StockMovement, movement_id)
        if existing is not None:
            owner = db.session.get(Product, existing.product_id)
            if owner.business_id != user.business_id:
                return jsonify(error="id already used"), 409
            # A replayed request: return the saved movement, create nothing.
            return jsonify(_movement_json(existing)), 200

    movement = StockMovement(
        product_id=product_id,
        user_id=user.id,
        movement_type=movement_type,
        quantity=quantity,
        note=note,
    )
    if movement_id is not None:
        movement.id = movement_id
    db.session.add(movement)
    db.session.commit()

    return jsonify(_movement_json(movement)), 201

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
