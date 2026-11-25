from flask import Blueprint, abort, jsonify
from flask_jwt_extended import current_user, jwt_required

from app import db
from app.errors import ValidationError
from app.models import Product
from app.services.audit import log_action
from app.services.stock import stock_by_product
from app.services.validation import json_body, read_int, read_string

products_bp = Blueprint("products", __name__, url_prefix="/api/products")

# field -> maximum length, matching the column sizes in models.py
TEXT_FIELDS = {"name": 150, "sku": 60, "unit": 30}
NUMBER_FIELDS = ["quantity_on_hand", "reorder_level", "unit_cost"]
EDITABLE_FIELDS = list(TEXT_FIELDS) + NUMBER_FIELDS


def product_to_dict(p, stock=None):
    data = {
        "id": p.id,
        "business_id": p.business_id,
        "name": p.name,
        "sku": p.sku,
        "unit": p.unit,
        "quantity_on_hand": p.quantity_on_hand,
        "reorder_level": p.reorder_level,
        "unit_cost": p.unit_cost,
    }
    if stock is not None:
        data["stock"] = stock
    return data


def get_business_product(product_id):
    """The product, if it belongs to the logged-in user's business. Another
    shop's product gets the same 404 as a missing one, so ids can't be probed."""
    product = db.session.get(Product, product_id)
    if product is None or product.business_id != current_user.business_id:
        abort(404, description="product not found")
    return product


def _read_fields(data, fields, creating):
    values = {}
    for field in fields:
        if field in TEXT_FIELDS:
            values[field] = read_string(
                data, field, TEXT_FIELDS[field], required=creating and field == "name"
            )
        else:
            values[field] = read_int(data, field, default=0 if creating else None)
    if not creating and "name" in values and values["name"] is None:
        raise ValidationError("name", "name cannot be empty")
    return values


@products_bp.get("")
@jwt_required()
def list_products():
    products = (
        Product.query.filter_by(business_id=current_user.business_id)
        .order_by(Product.name)
        .all()
    )
    # Stock comes from the movement ledger in one query, so the app doesn't
    # need a separate request per product.
    stock = stock_by_product(current_user.business_id)
    return jsonify([product_to_dict(p, stock.get(p.id, 0)) for p in products]), 200


@products_bp.get("/<product_id>")
@jwt_required()
def get_product(product_id):
    return jsonify(product_to_dict(get_business_product(product_id))), 200


@products_bp.post("")
@jwt_required()
def create_product():
    values = _read_fields(json_body(), EDITABLE_FIELDS, creating=True)
    # business_id always comes from the logged-in user. Anything the client
    # sends for it is ignored.
    product = Product(business_id=current_user.business_id, **values)
    db.session.add(product)
    # The product's id is only filled in when it is flushed, and the audit row needs it.
    db.session.flush()
    log_action(
        current_user,
        "product.created",
        "product",
        product.id,
        {"name": product.name, "unit_cost": product.unit_cost},
    )
    db.session.commit()
    return jsonify(product_to_dict(product)), 201


@products_bp.put("/<product_id>")
@jwt_required()
def update_product(product_id):
    product = get_business_product(product_id)
    data = json_body()
    changed_fields = [field for field in EDITABLE_FIELDS if field in data]
    for field, value in _read_fields(data, changed_fields, creating=False).items():
        setattr(product, field, value)

    log_action(
        current_user, "product.updated", "product", product.id, {"changed": changed_fields}
    )
    db.session.commit()
    return jsonify(product_to_dict(product)), 200
