import json

from flask import Blueprint, jsonify, request
from flask_jwt_extended import current_user, jwt_required

from app.services.access import require_owner
from app.services.audit import recent_audit_logs

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


def audit_log_to_dict(entry, user_name):
    return {
        "id": entry.id,
        "action": entry.action,
        "entity_type": entry.entity_type,
        "entity_id": entry.entity_id,
        "user_id": entry.user_id,
        "user_name": user_name,
        "details": json.loads(entry.details) if entry.details is not None else None,
        "created_at": entry.created_at.isoformat(),
    }


@audit_bp.get("")
@jwt_required()
def list_audit_logs():
    require_owner(current_user, "only the business owner can view the audit log")

    limit = _parse_limit(request.args.get("limit"))
    if limit is None:
        return jsonify({"error": "limit must be a positive integer"}), 400

    rows = recent_audit_logs(current_user.business_id, limit)
    return jsonify({"audit_logs": [audit_log_to_dict(e, name) for e, name in rows]}), 200
