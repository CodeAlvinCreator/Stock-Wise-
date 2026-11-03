import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import Business, Discrepancy, Product, StockCount, User


@pytest.fixture
def seed(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"
    business = Business(name="Test Shop")
    db.session.add(business)
    db.session.flush()
    user = User(
        business_id=business.id,
        name="Tester",
        email="tester@example.com",
        password_hash="not-a-real-hash",
    )
    product = Product(business_id=business.id, name="Sugar", quantity_on_hand=15)
    db.session.add_all([user, product])
    db.session.commit()
    token = create_access_token(identity=user.id)
    return {
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