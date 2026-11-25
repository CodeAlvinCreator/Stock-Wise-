import uuid

import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import AuditLog, Business, Product, StockMovement, User


@pytest.fixture
def setup(app):
    biz = Business(name="Kigali Shop")
    db.session.add(biz)
    db.session.flush()
    user = User(business_id=biz.id, name="Devis", email="d@x.com", password_hash="x")
    product = Product(business_id=biz.id, name="Sugar 1kg")
    db.session.add_all([user, product])
    db.session.commit()
    token = create_access_token(identity=user.id)
    return {"product_id": product.id, "headers": {"Authorization": f"Bearer {token}"}, "biz": biz}


def post(client, setup, movement_type, quantity, **extra):
    return client.post(
        "/api/movements",
        json={"product_id": setup["product_id"], "movement_type": movement_type,
              "quantity": quantity, **extra},
        headers=setup["headers"],
    )


def stock(client, setup):
    r = client.get(f"/api/products/{setup['product_id']}/stock", headers=setup["headers"])
    return r.get_json()["stock"]


def test_buy_20_sell_5_gives_15(client, setup):
    assert post(client, setup, "purchase", 20).status_code == 201
    assert post(client, setup, "sale", 5).status_code == 201
    assert stock(client, setup) == 15


def test_return_adds_and_damage_subtracts(client, setup):
    post(client, setup, "purchase", 20)
    post(client, setup, "return", 3)
    post(client, setup, "damage", 2)
    assert stock(client, setup) == 21


def test_stock_is_zero_with_no_movements(client, setup):
    assert stock(client, setup) == 0


def test_requires_jwt(client, setup):
    r = client.post("/api/movements", json={"product_id": setup["product_id"],
                                            "movement_type": "purchase", "quantity": 1})
    assert r.status_code == 401
    assert client.get(f"/api/products/{setup['product_id']}/stock").status_code == 401


@pytest.mark.parametrize("qty", [0, -5, 2.5, "10", True, None])
def test_rejects_bad_quantity(client, setup, qty):
    assert post(client, setup, "purchase", qty).status_code == 400


def test_rejects_bad_type(client, setup):
    assert post(client, setup, "gift", 5).status_code == 400


def test_unknown_product_404(client, setup):
    r = client.post("/api/movements",
                    json={"product_id": "nope", "movement_type": "purchase", "quantity": 1},
                    headers=setup["headers"])
    assert r.status_code == 404


def test_cannot_touch_other_business_product(client, setup):
    other = Business(name="Other")
    db.session.add(other)
    db.session.flush()
    p = Product(business_id=other.id, name="Secret")
    db.session.add(p)
    db.session.commit()
    r = client.post("/api/movements",
                    json={"product_id": p.id, "movement_type": "purchase", "quantity": 1},
                    headers=setup["headers"])
    assert r.status_code == 404
    assert client.get(f"/api/products/{p.id}/stock", headers=setup["headers"]).status_code == 404


def test_same_client_id_twice_creates_one_row(client, setup):
    movement_id = str(uuid.uuid4())
    first = post(client, setup, "purchase", 20, id=movement_id)
    second = post(client, setup, "purchase", 20, id=movement_id)
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.get_json()["id"] == movement_id
    assert StockMovement.query.count() == 1
    assert stock(client, setup) == 20


@pytest.mark.parametrize("bad_id", ["not-a-uuid", 123, ""])
def test_invalid_client_id_returns_400(client, setup, bad_id):
    r = post(client, setup, "purchase", 5, id=bad_id)
    assert r.status_code == 400
    assert r.get_json()["error"] == "id must be a valid UUID"


def test_movement_without_client_id_still_works(client, setup):
    r = post(client, setup, "purchase", 5)
    assert r.status_code == 201
    assert r.get_json()["id"]


def test_client_id_used_by_another_business_returns_409(client, setup):
    other = Business(name="Other")
    db.session.add(other)
    db.session.flush()
    other_user = User(business_id=other.id, name="O", email="o@x.com", password_hash="x")
    other_product = Product(business_id=other.id, name="Secret")
    db.session.add_all([other_user, other_product])
    db.session.flush()
    taken = str(uuid.uuid4())
    db.session.add(
        StockMovement(
            id=taken,
            product_id=other_product.id,
            user_id=other_user.id,
            movement_type="purchase",
            quantity=1,
        )
    )
    db.session.commit()
    r = post(client, setup, "purchase", 5, id=taken)
    assert r.status_code == 409


def test_movement_writes_one_audit_row(client, setup):
    r = post(client, setup, "sale", 2)
    rows = AuditLog.query.filter_by(action="movement.created").all()
    assert len(rows) == 1
    assert rows[0].entity_id == r.get_json()["id"]


def test_replayed_offline_movement_is_audited_once(client, setup):
    movement_id = str(uuid.uuid4())
    post(client, setup, "purchase", 20, id=movement_id)
    replay = post(client, setup, "purchase", 20, id=movement_id)

    assert replay.status_code == 200
    rows = AuditLog.query.filter_by(action="movement.created").all()
    assert [row.entity_id for row in rows] == [movement_id]


def test_rejected_movement_is_not_audited(client, setup):
    post(client, setup, "purchase", -1)
    assert AuditLog.query.count() == 0


@pytest.mark.parametrize("note", ["x" * 256, 42])
def test_rejects_bad_note(client, setup, note):
    r = post(client, setup, "purchase", 1, note=note)
    assert r.status_code == 400
    assert r.get_json()["field"] == "note"


def test_missing_product_id_returns_400(client, setup):
    r = client.post("/api/movements", json={"movement_type": "purchase", "quantity": 1},
                    headers=setup["headers"])
    assert r.status_code == 400
    assert r.get_json()["field"] == "product_id"
