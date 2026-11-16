from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from app import db
from app.models import Product

products_bp = Blueprint("products", __name__, url_prefix="/api/products")


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
    db.session.commit()
    return jsonify(product_to_dict(product)), 201


@products_bp.put("/<product_id>")
@jwt_required()
def update_product(product_id):
    product = db.session.get(Product, product_id)
    if product is None:
        return jsonify({"error": "product not found"}), 404

    data = request.get_json() or {}
    for field in ["name", "sku", "unit", "quantity_on_hand", "reorder_level", "unit_cost"]:
        if field in data:
            setattr(product, field, data[field])

    db.session.commit()
    return jsonify(product_to_dict(product)), 200