from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import Discrepancy, Product, User, utcnow

discrepancies_bp = Blueprint("discrepancies", __name__, url_prefix="/api/discrepancies")

# Peace's Investigate screen uses these exact values. Do not rename them.
CAUSES = (
    "unrecorded_sale",
    "damaged_or_expired",
    "theft",
    "counting_mistake",
    "supplier_short_delivery",
    "other",
)
STATUSES = ("open", "investigated", "resolved")
MAX_FINDING_LENGTH = 1000


def _iso(value):
    return value.isoformat() if value else None


def serialize_discrepancy(discrepancy, product):
    """The shape every discrepancy endpoint returns (SW-14 reuses it)."""
    return {
        "id": discrepancy.id,
        "product_id": product.id,
        "product_name": product.name,
        "difference": discrepancy.difference,
        # Negative for a shortage: that much money's worth of stock is missing.
        "value_rwf": discrepancy.difference * (product.unit_cost or 0),
        "status": discrepancy.status,
        "cause": discrepancy.cause,
        "finding": discrepancy.finding,
        "created_at": _iso(discrepancy.created_at),
        "investigated_at": _iso(discrepancy.investigated_at),
        "resolved_at": _iso(discrepancy.resolved_at),
    }


def _current_user():
    return db.session.get(User, get_jwt_identity())


def _business_discrepancies(user):
    """Discrepancies joined to their product, limited to the user's business."""
    return (
        db.session.query(Discrepancy, Product)
        .join(Product, Discrepancy.product_id == Product.id)
        .filter(Product.business_id == user.business_id)
    )


@discrepancies_bp.route("", methods=["GET"])
@jwt_required()
def list_discrepancies():
    user = _current_user()
    if user is None:
        return jsonify({"error": "user not found"}), 401

    status = request.args.get("status")
    if status is not None and status not in STATUSES:
        return jsonify({"error": f"status must be one of: {', '.join(STATUSES)}"}), 400

    query = _business_discrepancies(user)
    if status is not None:
        query = query.filter(Discrepancy.status == status)
    rows = query.order_by(Discrepancy.created_at.desc()).all()

    return jsonify({"discrepancies": [serialize_discrepancy(d, p) for d, p in rows]}), 200


@discrepancies_bp.route("/<discrepancy_id>/investigate", methods=["POST"])
@jwt_required()
def investigate_discrepancy(discrepancy_id):
    user = _current_user()
    if user is None:
        return jsonify({"error": "user not found"}), 401

    row = _business_discrepancies(user).filter(Discrepancy.id == discrepancy_id).first()
    if row is None:
        return jsonify({"error": "discrepancy not found"}), 404
    discrepancy, product = row

    if discrepancy.status != "open":
        return jsonify({"error": "discrepancy is not open"}), 409

    data = request.get_json(silent=True) or {}
    cause = data.get("cause")
    finding = data.get("finding")

    if cause not in CAUSES:
        return jsonify({"error": f"cause must be one of: {', '.join(CAUSES)}"}), 400
    if not isinstance(finding, str) or not 1 <= len(finding.strip()) <= MAX_FINDING_LENGTH:
        return jsonify({"error": "finding must be text of 1 to 1000 characters"}), 400

    discrepancy.cause = cause
    discrepancy.finding = finding.strip()
    discrepancy.investigated_by = user.id
    discrepancy.investigated_at = utcnow()
    discrepancy.status = "investigated"
    db.session.commit()

    return jsonify(serialize_discrepancy(discrepancy, product)), 200
