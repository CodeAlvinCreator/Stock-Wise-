from sqlalchemy import select

from app import db
from app.models import (
    AuditLog,
    Business,
    Discrepancy,
    Product,
    StockCount,
    StockMovement,
    User,
    utcnow,
)
from app.services.audit import log_action

REMOVED_NAME = "Removed user"


def deactivate_user(user, removed_by):
    """Deactivate and anonymise a user, keeping the row.

    Their movements, counts and audit rows keep pointing at the same id, so the
    shop's history stays complete. The email is freed so it can be used again.
    The caller commits.
    """
    log_action(removed_by, "user.removed", "user", user.id, {"role": user.role})
    user.is_active = False
    user.deactivated_at = utcnow()
    user.name = REMOVED_NAME
    user.email = f"removed-{user.id}@stockwise.invalid"
    # Not a bcrypt hash, so no password can ever match it again.
    user.password_hash = "!"


def delete_business(business_id):
    """Permanently delete a business and everything in it. The caller commits.

    This is the right-to-erasure path under Rwanda's data protection law
    (Law No 058/2021): an owner can have all of the shop's data removed.
    Rows are deleted children first, so no foreign key is ever left dangling.
    """
    product_ids = select(Product.id).where(Product.business_id == business_id)
    deletions = [
        AuditLog.__table__.delete().where(AuditLog.business_id == business_id),
        Discrepancy.__table__.delete().where(Discrepancy.product_id.in_(product_ids)),
        StockCount.__table__.delete().where(StockCount.product_id.in_(product_ids)),
        StockMovement.__table__.delete().where(StockMovement.product_id.in_(product_ids)),
        Product.__table__.delete().where(Product.business_id == business_id),
        User.__table__.delete().where(User.business_id == business_id),
        Business.__table__.delete().where(Business.id == business_id),
    ]
    for statement in deletions:
        db.session.execute(statement)
