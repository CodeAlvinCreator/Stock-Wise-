from flask import Blueprint, abort, jsonify, request
from flask_jwt_extended import current_user, jwt_required
from sqlalchemy import update

from app import db
from app.errors import ValidationError
from app.models import Discrepancy, Product, StockMovement, utcnow
from app.services.access import require_owner
from app.services.audit import log_action
from app.services.stock import current_stock
from app.services.validation import json_body, read_string

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


def _business_discrepancies(business_id):
    """Discrepancies joined to their product, limited to one business."""
    return (
        db.session.query(Discrepancy, Product)
        .join(Product, Discrepancy.product_id == Product.id)
        .filter(Product.business_id == business_id)
    )


def _get_business_discrepancy(discrepancy_id):
    row = (
        _business_discrepancies(current_user.business_id)
        .filter(Discrepancy.id == discrepancy_id)
        .first()
    )
    if row is None:
        abort(404, description="discrepancy not found")
    return row


def _move_status(discrepancy, from_status, **changes):
    """Change the status only if it is still `from_status`.

    The WHERE on status makes this safe when two people press the button at
    the same moment: only one UPDATE matches, the other gets a 409 instead of
    applying the stock correction a second time.
    """
    result = db.session.execute(
        update(Discrepancy)
        .where(Discrepancy.id == discrepancy.id, Discrepancy.status == from_status)
        .values(**changes)
    )
    if result.rowcount != 1:
        db.session.rollback()
        abort(409, description=f"discrepancy is not {from_status}")
    db.session.refresh(discrepancy)


@discrepancies_bp.route("", methods=["GET"])
@jwt_required()
def list_discrepancies():
    status = request.args.get("status")
    if status is not None and status not in STATUSES:
        abort(400, description=f"status must be one of: {', '.join(STATUSES)}")

    query = _business_discrepancies(current_user.business_id)
    if status is not None:
        query = query.filter(Discrepancy.status == status)
    rows = query.order_by(Discrepancy.created_at.desc()).all()

    return jsonify({"discrepancies": [serialize_discrepancy(d, p) for d, p in rows]}), 200


@discrepancies_bp.route("/<discrepancy_id>/investigate", methods=["POST"])
@jwt_required()
def investigate_discrepancy(discrepancy_id):
    discrepancy, product = _get_business_discrepancy(discrepancy_id)
    if discrepancy.status != "open":
        abort(409, description="discrepancy is not open")

    data = json_body()
    cause = data.get("cause")
    if cause not in CAUSES:
        raise ValidationError("cause", f"cause must be one of: {', '.join(CAUSES)}")
    finding = read_string(data, "finding", MAX_FINDING_LENGTH, required=True)

    _move_status(
        discrepancy,
        "open",
        status="investigated",
        cause=cause,
        finding=finding,
        investigated_by=current_user.id,
        investigated_at=utcnow(),
    )
    log_action(
        current_user,
        "discrepancy.investigated",
        "discrepancy",
        discrepancy.id,
        {"cause": cause},
    )
    db.session.commit()

    return jsonify(serialize_discrepancy(discrepancy, product)), 200


@discrepancies_bp.route("/<discrepancy_id>/resolve", methods=["POST"])
@jwt_required()
def resolve_discrepancy(discrepancy_id):
    discrepancy, product = _get_business_discrepancy(discrepancy_id)
    require_owner(current_user, "only the business owner can resolve a discrepancy")
    if discrepancy.status != "investigated":
        abort(409, description="only an investigated discrepancy can be resolved")

    _move_status(
        discrepancy,
        "investigated",
        status="resolved",
        resolved_by=current_user.id,
        resolved_at=utcnow(),
    )

    # Stock is the sum of the movement ledger, so the correction is a movement
    # of the counted difference. With no sales since the count, stock ends up
    # exactly at the counted figure.
    correction = StockMovement(
        product_id=product.id,
        user_id=current_user.id,
        movement_type="adjustment_in" if discrepancy.difference > 0 else "adjustment_out",
        quantity=abs(discrepancy.difference),
        note=f"Resolved discrepancy {discrepancy.id}",
    )
    db.session.add(correction)
    db.session.flush()
    stock_after = current_stock(product.id)
    product.quantity_on_hand = stock_after

    log_action(
        current_user,
        "discrepancy.resolved",
        "discrepancy",
        discrepancy.id,
        {
            "movement_id": correction.id,
            "difference": discrepancy.difference,
            "stock_after": stock_after,
        },
    )
    # One commit: the status change, the correction and the audit row are
    # saved together or not at all.
    db.session.commit()

    return jsonify({
        "discrepancy": serialize_discrepancy(discrepancy, product),
        "movement_id": correction.id,
        "stock_after": stock_after,
    }), 200
