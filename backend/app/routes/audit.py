import json

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import AuditLog, User

audit_bp = Blueprint("audit", __name__, url_prefix="/api/audit-logs")

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def _parse_limit(raw_value):
    """Return the limit as an int (capped at MAX_LIMIT), or None if it is invalid."""
    if raw_value is None:
        return DEFAULT_LIMIT
    if not raw_value.isdecimal() or int(raw_value) == 0:
        return None
    return min(int(raw_value), MAX_LIMIT)


def _audit_log_to_dict(entry):
    return {
        "id": entry.id,
        "action": entry.action,
        "entity_type": entry.entity_type,
        "entity_id": entry.entity_id,
        "user_id": entry.user_id,
        "details": json.loads(entry.details) if entry.details is not None else None,
        "created_at": entry.created_at.isoformat(),
    }


@audit_bp.get("")
@jwt_required()
def list_audit_logs():
    user = db.session.get(User, get_jwt_identity())
    if user is None:
        return jsonify({"error": "user not found"}), 401

    # Read the role from the database, not the token, so a demoted user loses access at once.
    if user.role != "owner":
        return jsonify({"error": "only the business owner can view the audit log"}), 403

    limit = _parse_limit(request.args.get("limit"))
    if limit is None:
        return jsonify({"error": "limit must be a positive integer"}), 400

    entries = (
        AuditLog.query.filter_by(business_id=user.business_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({"audit_logs": [_audit_log_to_dict(e) for e in entries]}), 200
