import json

from app import db
from app.models import AuditLog, User


def log_action(user, action, entity_type, entity_id, details=None):
    """Add one audit row for something the user just did.

    This does not commit. The caller commits once, so the change and its
    audit row are saved together, or neither is saved.

    Action names look like "<entity>.<past tense verb>", e.g. "product.created".
    """
    entry = AuditLog(
        business_id=user.business_id,
        user_id=user.id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=json.dumps(details) if details is not None else None,
    )
    db.session.add(entry)
    return entry


def recent_audit_logs(business_id, limit, since=None, until=None):
    """Newest first, each paired with the name of the user who did it."""
    query = (
        db.session.query(AuditLog, User.name)
        .outerjoin(User, AuditLog.user_id == User.id)
        .filter(AuditLog.business_id == business_id)
    )
    if since is not None:
        query = query.filter(AuditLog.created_at >= since)
    if until is not None:
        query = query.filter(AuditLog.created_at < until)
    return query.order_by(AuditLog.created_at.desc()).limit(limit).all()
