from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import Product, User
from app.services.audit import log_action

products_bp = Blueprint("products", __name__, url_prefix="/api/products")

EDITABLE_FIELDS = ["name", "sku", "unit", "quantity_on_hand", "reorder_level", "unit_cost"]


def product_to_dict(p):
    return {
        "id": p.id,
        "business_id": p.business_id,
        "name": p.name,
        "sku": p.sku,
        "unit": p.unit,
        "quantity_on_hand": p.quantity_on_hand,
        "reorder_level": p.reorder_level,
        "unit_cost": p.unit_cost,
    }


@products_bp.get("")
@jwt_required()
def list_products():
    products = Product.query.all()
    return jsonify([product_to_dict(p) for p in products]), 200


@products_bp.post("")
@jwt_required()
def create_product():
    user = db.session.get(User, get_jwt_identity())
    if user is None:
        return jsonify({"error": "user not found"}), 401

    data = request.get_json() or {}
    if not data.get("name") or not data.get("business_id"):
        return jsonify({"error": "name and business_id are required"}), 400

    product = Product(
        business_id=data["business_id"],
        name=data["name"],
        sku=data.get("sku"),
        unit=data.get("unit"),
        quantity_on_hand=data.get("quantity_on_hand", 0),
        reorder_level=data.get("reorder_level", 0),
        unit_cost=data.get("unit_cost", 0),
    )
    db.session.add(product)
    # The product's id is only filled in when it is flushed, and the audit row needs it.
    db.session.flush()
    log_action(
        user,
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
    user = db.session.get(User, get_jwt_identity())
    if user is None:
        return jsonify({"error": "user not found"}), 401

    product = db.session.get(Product, product_id)
    if product is None:
        return jsonify({"error": "product not found"}), 404

    data = request.get_json() or {}
    changed_fields = [field for field in EDITABLE_FIELDS if field in data]
    for field in changed_fields:
        setattr(product, field, data[field])

    log_action(user, "product.updated", "product", product.id, {"changed": changed_fields})
    db.session.commit()
    return jsonify(product_to_dict(product)), 200
