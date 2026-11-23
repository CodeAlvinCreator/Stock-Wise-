import json

from app import db
from app.models import AuditLog


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
