import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import Business, Product, StockMovement, User
from app.services.stock import current_stock


@pytest.fixture
def seed(app):
    business = Business(name="Test Shop")
    db.session.add(business)
    db.session.flush()

    user = User(
        business_id=business.id,
        name="Owner",
        email="owner@example.com",
        password_hash="not-used",
        role="owner",
    )
    product = Product(
        business_id=business.id, name="Sugar", sku="SUG-1", unit="kg", unit_cost=1500
    )
    db.session.add_all([user, product])
    db.session.flush()

    # Stock comes from the ledger: 10 units purchased.
    db.session.add(
        StockMovement(
            product_id=product.id,
            user_id=user.id,
            movement_type="purchase",
            quantity=10,
        )
    )
    db.session.commit()

    token = create_access_token(identity=user.id)
    return {
        "user_id": user.id,
        "product_id": product.id,
        "headers": {"Authorization": f"Bearer {token}"},
    }


def _add_movement(seed, movement_type, quantity):
    db.session.add(
        StockMovement(
            product_id=seed["product_id"],
            user_id=seed["user_id"],
            movement_type=movement_type,
            quantity=quantity,
        )
    )
    db.session.commit()


def test_adjustment_in_adds_stock(seed):
    _add_movement(seed, "adjustment_in", 5)
    assert current_stock(seed["product_id"]) == 15


def test_adjustment_out_removes_stock(seed):
    _add_movement(seed, "adjustment_out", 4)
    assert current_stock(seed["product_id"]) == 6


@pytest.mark.parametrize("movement_type", ["adjustment_in", "adjustment_out"])
def test_post_movement_rejects_adjustment_types(client, seed, movement_type):
    response = client.post(
        "/api/movements",
        json={
            "product_id": seed["product_id"],
            "movement_type": movement_type,
            "quantity": 3,
        },
        headers=seed["headers"],
    )
    assert response.status_code == 400
    assert "error" in response.get_json()
