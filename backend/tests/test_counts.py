import uuid

import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import AuditLog, Business, Discrepancy, Product, StockCount, StockMovement, User


@pytest.fixture
def seed(app):
    business = Business(name="Test Shop")
    db.session.add(business)
    db.session.flush()
    user = User(
        business_id=business.id,
        name="Tester",
        email="tester@example.com",
        password_hash="not-a-real-hash",
    )
    product = Product(business_id=business.id, name="Sugar")
    db.session.add_all([user, product])
    db.session.flush()
    # Stock comes from the ledger: one purchase of 15.
    db.session.add(
        StockMovement(product_id=product.id, user_id=user.id, movement_type="purchase", quantity=15)
    )
    db.session.commit()
    token = create_access_token(identity=user.id)
    return {
        "user_id": user.id,
        "product_id": product.id,
        "headers": {"Authorization": f"Bearer {token}"},
    }


def test_shortage_creates_discrepancy(client, seed):
    response = client.post(
        "/api/counts",
        json={"product_id": seed["product_id"], "counted_quantity": 12},
        headers=seed["headers"],
    )
    assert response.status_code == 201
    body = response.get_json()
    assert body["kind"] == "shortage"
    assert body["discrepancy"]["difference"] == -3
    assert Discrepancy.query.count() == 1
    assert StockCount.query.count() == 1


def test_exact_match_creates_no_discrepancy(client, seed):
    response = client.post(
        "/api/counts",
        json={"product_id": seed["product_id"], "counted_quantity": 15},
        headers=seed["headers"],
    )
    assert response.status_code == 201
    assert response.get_json()["discrepancy"] is None
    assert Discrepancy.query.count() == 0
    assert StockCount.query.count() == 1


def test_unknown_product_returns_404(client, seed):
    response = client.post(
        "/api/counts",
        json={"product_id": "does-not-exist", "counted_quantity": 5},
        headers=seed["headers"],
    )
    assert response.status_code == 404


def test_bad_quantity_returns_400(client, seed):
    response = client.post(
        "/api/counts",
        json={"product_id": seed["product_id"], "counted_quantity": -2},
        headers=seed["headers"],
    )
    assert response.status_code == 400


def test_requires_token(client, seed):
    response = client.post(
        "/api/counts",
        json={"product_id": seed["product_id"], "counted_quantity": 12},
    )
    assert response.status_code == 401


def _count(client, seed, counted, **extra):
    return client.post(
        "/api/counts",
        json={"product_id": seed["product_id"], "counted_quantity": counted, **extra},
        headers=seed["headers"],
    )


def _other_business_product():
    other = Business(name="Other Shop")
    db.session.add(other)
    db.session.flush()
    other_user = User(business_id=other.id, name="O", email="o@x.com", password_hash="x")
    product = Product(business_id=other.id, name="Secret")
    db.session.add_all([other_user, product])
    db.session.commit()
    return other_user, product


def test_same_client_id_twice_creates_one_count(client, seed):
    count_id = str(uuid.uuid4())
    first = _count(client, seed, 12, id=count_id)
    replay = _count(client, seed, 12, id=count_id)

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.get_json() == first.get_json()
    assert StockCount.query.count() == 1
    assert Discrepancy.query.count() == 1
    assert AuditLog.query.filter_by(action="count.created").count() == 1


def test_replayed_count_keeps_its_original_expected_figure(client, seed):
    count_id = str(uuid.uuid4())
    _count(client, seed, 12, id=count_id)
    db.session.add(StockMovement(product_id=seed["product_id"], user_id=seed["user_id"],
                                 movement_type="sale", quantity=3))
    db.session.commit()

    replay = _count(client, seed, 12, id=count_id).get_json()

    assert replay["count"]["expected_quantity"] == 15
    assert replay["kind"] == "shortage"


@pytest.mark.parametrize("bad_id", ["not-a-uuid", 123, ""])
def test_invalid_count_id_returns_400(client, seed, bad_id):
    response = _count(client, seed, 12, id=bad_id)
    assert response.status_code == 400
    assert response.get_json()["field"] == "id"


def test_count_id_used_by_another_business_returns_409(client, seed):
    other_user, other_product = _other_business_product()
    taken = str(uuid.uuid4())
    db.session.add(StockCount(id=taken, product_id=other_product.id, user_id=other_user.id,
                              expected_quantity=1, counted_quantity=1))
    db.session.commit()

    assert _count(client, seed, 12, id=taken).status_code == 409


def test_other_business_product_returns_404(client, seed):
    _, other_product = _other_business_product()
    response = client.post(
        "/api/counts",
        json={"product_id": other_product.id, "counted_quantity": 1},
        headers=seed["headers"],
    )
    assert response.status_code == 404


@pytest.mark.parametrize("counted", ["12", 1.5, True, None])
def test_non_integer_count_returns_400(client, seed, counted):
    response = _count(client, seed, counted)
    assert response.status_code == 400
    assert response.get_json()["field"] == "counted_quantity"
