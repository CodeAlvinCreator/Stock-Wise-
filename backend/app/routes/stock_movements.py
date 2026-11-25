from flask import Blueprint, abort, jsonify
from flask_jwt_extended import current_user, jwt_required

from app import db
from app.errors import ValidationError
from app.models import Product, StockMovement
from app.routes.products import get_business_product
from app.services.audit import log_action
from app.services.stock import PUBLIC_MOVEMENT_TYPES, current_stock
from app.services.validation import json_body, read_int, read_string, read_uuid

bp = Blueprint("stock_movements", __name__, url_prefix="/api")


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
    data = json_body()
    product_id = read_string(data, "product_id", 36, required=True)
    movement_type = data.get("movement_type")
    if movement_type not in PUBLIC_MOVEMENT_TYPES:
        raise ValidationError(
            "movement_type",
            f"movement_type must be one of: {', '.join(PUBLIC_MOVEMENT_TYPES)}",
        )
    quantity = read_int(data, "quantity", minimum=1)
    note = read_string(data, "note", 255)
    # Optional id made on the phone, so a replayed offline request is recognised.
    movement_id = read_uuid(data, "id")

    product = get_business_product(product_id)

    if movement_id is not None:
        existing = db.session.get(StockMovement, movement_id)
        if existing is not None:
            owner = db.session.get(Product, existing.product_id)
            if owner.business_id != current_user.business_id:
                abort(409, description="id already used")
            # A replayed request: return the saved movement, create nothing.
            # This returns before log_action, so a replay is never audited twice.
            return jsonify(_movement_json(existing)), 200

    movement = StockMovement(
        product_id=product.id,
        user_id=current_user.id,
        movement_type=movement_type,
        quantity=quantity,
        note=note,
    )
    if movement_id is not None:
        movement.id = movement_id
    db.session.add(movement)
    db.session.flush()
    log_action(
        current_user,
        "movement.created",
        "movement",
        movement.id,
        {"product_id": product.id, "movement_type": movement_type, "quantity": quantity},
    )
    db.session.commit()

    return jsonify(_movement_json(movement)), 201


@bp.route("/products/<product_id>/stock", methods=["GET"])
@jwt_required()
def get_product_stock(product_id):
    product = get_business_product(product_id)
    return jsonify(product_id=product.id, name=product.name, stock=current_stock(product.id))
