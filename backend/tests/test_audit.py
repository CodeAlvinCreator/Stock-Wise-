import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import AuditLog, Business, Product, User
from app.services.audit import log_action


def make_user(business, email, role):
    user = User(
        business_id=business.id,
        name=email.split("@")[0],
        email=email,
        password_hash="not-a-real-hash",
        role=role,
    )
    db.session.add(user)
    return user


def headers_for(user):
    token = create_access_token(identity=user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seed(app):
    """Business A has an owner and a staff member. Business B has only an owner."""
    business_a = Business(name="Shop A")
    business_b = Business(name="Shop B")
    db.session.add_all([business_a, business_b])
    db.session.flush()

    owner_a = make_user(business_a, "owner-a@example.com", "owner")
    staff_a = make_user(business_a, "staff-a@example.com", "staff")
    owner_b = make_user(business_b, "owner-b@example.com", "owner")
    product_a = Product(business_id=business_a.id, name="Sugar", quantity_on_hand=10)
    db.session.add(product_a)
    db.session.commit()

    return {
        "business_a": business_a,
        "owner_a": owner_a,
        "staff_a": staff_a,
        "owner_b": owner_b,
        "product_a": product_a,
    }


def test_creating_product_writes_one_audit_row(client, seed):
    response = client.post(
        "/api/products",
        json={"name": "Rice", "business_id": seed["business_a"].id, "unit_cost": 1200},
        headers=headers_for(seed["owner_a"]),
    )
    assert response.status_code == 201

    rows = AuditLog.query.filter_by(action="product.created").all()
    assert len(rows) == 1
    assert rows[0].entity_id == response.get_json()["id"]
    assert rows[0].business_id == seed["business_a"].id
    assert rows[0].user_id == seed["owner_a"].id


def test_updating_product_logs_changed_fields(client, seed):
    response = client.put(
        f"/api/products/{seed['product_a'].id}",
        json={"name": "Brown sugar", "unit_cost": 900},
        headers=headers_for(seed["owner_a"]),
    )
    assert response.status_code == 200

    logs = client.get("/api/audit-logs", headers=headers_for(seed["owner_a"])).get_json()
    assert logs["audit_logs"][0]["action"] == "product.updated"
    assert logs["audit_logs"][0]["details"] == {"changed": ["name", "unit_cost"]}


def test_recording_count_writes_one_audit_row(client, seed):
    response = client.post(
        "/api/counts",
        json={"product_id": seed["product_a"].id, "counted_quantity": 7},
        headers=headers_for(seed["staff_a"]),
    )
    assert response.status_code == 201

    rows = AuditLog.query.filter_by(action="count.created").all()
    assert len(rows) == 1
    assert rows[0].entity_id == response.get_json()["count"]["id"]


def test_staff_cannot_read_audit_logs(client, seed):
    response = client.get("/api/audit-logs", headers=headers_for(seed["staff_a"]))
    assert response.status_code == 403


def test_other_business_logs_are_never_returned(client, seed):
    log_action(seed["owner_a"], "product.created", "product", "a-product")
    log_action(seed["owner_b"], "product.created", "product", "b-product")
    db.session.commit()

    response = client.get("/api/audit-logs", headers=headers_for(seed["owner_a"]))
    assert response.status_code == 200
    entity_ids = [row["entity_id"] for row in response.get_json()["audit_logs"]]
    assert entity_ids == ["a-product"]


def test_limit_returns_at_most_n_rows(client, seed):
    for number in range(5):
        log_action(seed["owner_a"], "product.updated", "product", f"p-{number}")
    db.session.commit()

    response = client.get("/api/audit-logs?limit=3", headers=headers_for(seed["owner_a"]))
    assert response.status_code == 200
    assert len(response.get_json()["audit_logs"]) == 3


def test_limit_above_200_is_capped_at_200(client, seed):
    for number in range(201):
        log_action(seed["owner_a"], "product.updated", "product", f"p-{number}")
    db.session.commit()

    response = client.get("/api/audit-logs?limit=500", headers=headers_for(seed["owner_a"]))
    assert response.status_code == 200
    assert len(response.get_json()["audit_logs"]) == 200


@pytest.mark.parametrize("bad_limit", ["abc", "0", "-3"])
def test_invalid_limit_returns_400(client, seed, bad_limit):
    response = client.get(
        f"/api/audit-logs?limit={bad_limit}", headers=headers_for(seed["owner_a"])
    )
    assert response.status_code == 400
    assert response.get_json() == {"error": "limit must be a positive integer"}


def test_log_action_does_not_commit_on_its_own(app, seed):
    log_action(seed["owner_a"], "product.created", "product", "never-saved")
    db.session.rollback()
    assert AuditLog.query.count() == 0
