import uuid
from datetime import datetime, timezone

from app import db


def gen_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


class Business(db.Model):
    __tablename__ = "businesses"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    name = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    business_id = db.Column(
        db.String(36), db.ForeignKey("businesses.id"), nullable=False, index=True
    )
    name = db.Column(db.String(120), nullable=False)
    # Always stored trimmed and lowercased. The index on lower(email) also
    # stops "Favour@shop.rw" and "favour@shop.rw" becoming two accounts.
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(30), nullable=False, default="staff")
    # A removed user is deactivated and anonymised instead of deleted, so the
    # movements and audit rows that point at them stay intact.
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    deactivated_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    __table_args__ = (db.Index("uq_users_email_lower", db.func.lower(email), unique=True),)


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    business_id = db.Column(
        db.String(36), db.ForeignKey("businesses.id"), nullable=False, index=True
    )
    name = db.Column(db.String(150), nullable=False)
    sku = db.Column(db.String(60))
    unit = db.Column(db.String(30))
    quantity_on_hand = db.Column(db.Integer, nullable=False, default=0)
    reorder_level = db.Column(db.Integer, default=0)
    # Cost price of one unit in Rwandan francs. RWF has no coins in everyday
    # use, so a whole number is exact and avoids floating-point rounding.
    unit_cost = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    created_at = db.Column(db.DateTime, default=utcnow)


class StockMovement(db.Model):
    __tablename__ = "stock_movements"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    product_id = db.Column(
        db.String(36), db.ForeignKey("products.id"), nullable=False, index=True
    )
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    movement_type = db.Column(db.String(20), nullable=False)  # purchase / sale / return / damage
    quantity = db.Column(db.Integer, nullable=False)
    note = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=utcnow)


class StockCount(db.Model):
    __tablename__ = "stock_counts"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    product_id = db.Column(
        db.String(36), db.ForeignKey("products.id"), nullable=False, index=True
    )
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    expected_quantity = db.Column(db.Integer, nullable=False)
    counted_quantity = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)


class Discrepancy(db.Model):
    __tablename__ = "discrepancies"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    stock_count_id = db.Column(
        db.String(36), db.ForeignKey("stock_counts.id"), nullable=False, index=True
    )
    product_id = db.Column(
        db.String(36), db.ForeignKey("products.id"), nullable=False, index=True
    )
    difference = db.Column(db.Integer, nullable=False)
    # open -> investigated -> resolved
    status = db.Column(db.String(20), nullable=False, default="open")
    cause = db.Column(db.String(60), nullable=True)
    finding = db.Column(db.Text, nullable=True)
    investigated_by = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    investigated_at = db.Column(db.DateTime, nullable=True)
    resolved_by = db.Column(db.String(36), db.ForeignKey("users.id"))
    resolved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    business_id = db.Column(db.String(36), db.ForeignKey("businesses.id"), index=True)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"))
    action = db.Column(db.String(100), nullable=False)
    entity_type = db.Column(db.String(60))
    entity_id = db.Column(db.String(36))
    details = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utcnow)
