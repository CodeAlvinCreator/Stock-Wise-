import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import Business, Product, StockMovement, User


def seed_owner():
    business = Business(name="Test Shop")
    db.session.add(business)
    db.session.flush()
    user = User(
        business_id=business.id,
        name="Owner",
        email="owner@example.com",
        password_hash="not-a-real-hash",
        role="owner",
    )
    db.session.add(user)
    db.session.commit()
    return business, user


def auth_headers(user):
    token = create_access_token(identity=user.id)
    return {"Authorization": f"Bearer {token}"}


def test_create_then_list_products(client):
    business, user = seed_owner()

    response = client.post(
        "/api/products",
        json={"name": "Rice", "business_id": business.id},
        headers=auth_headers(user),
    )
    assert response.status_code == 201

    response = client.get("/api/products", headers=auth_headers(user))
    assert response.status_code == 200
    names = [p["name"] for p in response.get_json()]
    assert "Rice" in names


def seed_other_business_product():
    other = Business(name="Other Shop")
    db.session.add(other)
    db.session.flush()
    product = Product(business_id=other.id, name="Secret stock")
    db.session.add(product)
    db.session.commit()
    return other, product


def test_create_ignores_business_id_in_body(client):
    business, user = seed_owner()
    other, _ = seed_other_business_product()

    response = client.post(
        "/api/products",
        json={"name": "Rice", "business_id": other.id},
        headers=auth_headers(user),
    )

    assert response.status_code == 201
    assert response.get_json()["business_id"] == business.id


def test_list_only_returns_own_products_with_stock(client):
    business, user = seed_owner()
    seed_other_business_product()
    rice = Product(business_id=business.id, name="Rice")
    db.session.add(rice)
    db.session.flush()
    db.session.add(StockMovement(product_id=rice.id, user_id=user.id,
                                 movement_type="purchase", quantity=7))
    db.session.commit()

    body = client.get("/api/products", headers=auth_headers(user)).get_json()

    assert [(p["name"], p["stock"]) for p in body] == [("Rice", 7)]


def test_get_own_product(client):
    business, user = seed_owner()
    rice = Product(business_id=business.id, name="Rice")
    db.session.add(rice)
    db.session.commit()

    response = client.get(f"/api/products/{rice.id}", headers=auth_headers(user))

    assert response.status_code == 200
    assert response.get_json()["name"] == "Rice"


def test_other_business_product_is_404_for_get_and_put(client):
    _, user = seed_owner()
    _, secret = seed_other_business_product()

    get_response = client.get(f"/api/products/{secret.id}", headers=auth_headers(user))
    put_response = client.put(
        f"/api/products/{secret.id}", json={"name": "Mine now"}, headers=auth_headers(user)
    )

    assert get_response.status_code == 404
    assert put_response.status_code == 404
    assert db.session.get(Product, secret.id).name == "Secret stock"


def test_update_own_product(client):
    business, user = seed_owner()
    rice = Product(business_id=business.id, name="Rice")
    db.session.add(rice)
    db.session.commit()

    response = client.put(
        f"/api/products/{rice.id}",
        json={"name": "Rice 5kg", "reorder_level": 3},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    assert response.get_json()["reorder_level"] == 3


@pytest.mark.parametrize(
    "body, field",
    [
        ({}, "name"),
        ({"name": "   "}, "name"),
        ({"name": "x" * 151}, "name"),
        ({"name": 42}, "name"),
        ({"name": "Rice", "unit_cost": -1}, "unit_cost"),
        ({"name": "Rice", "unit_cost": "1500"}, "unit_cost"),
        ({"name": "Rice", "reorder_level": 2.5}, "reorder_level"),
        ({"name": "Rice", "quantity_on_hand": True}, "quantity_on_hand"),
        ({"name": "Rice", "sku": "x" * 61}, "sku"),
        ({"name": "Rice", "unit_cost": 3_000_000_000}, "unit_cost"),
    ],
)
def test_create_rejects_bad_input(client, body, field):
    _, user = seed_owner()
    response = client.post("/api/products", json=body, headers=auth_headers(user))
    assert response.status_code == 400
    assert response.get_json()["field"] == field


def test_create_rejects_non_object_body(client):
    _, user = seed_owner()
    response = client.post("/api/products", json=["Rice"], headers=auth_headers(user))
    assert response.status_code == 400


def test_update_rejects_empty_name(client):
    business, user = seed_owner()
    rice = Product(business_id=business.id, name="Rice")
    db.session.add(rice)
    db.session.commit()

    response = client.put(
        f"/api/products/{rice.id}", json={"name": ""}, headers=auth_headers(user)
    )

    assert response.status_code == 400
    assert db.session.get(Product, rice.id).name == "Rice"


def test_products_require_token(client):
    assert client.get("/api/products").status_code == 401
    assert client.post("/api/products", json={"name": "Rice"}).status_code == 401
