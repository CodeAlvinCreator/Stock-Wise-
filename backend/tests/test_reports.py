"""Tests for GET /api/reports/valuation."""

import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import Business, Product, StockMovement, User


def make_shop(name, email, role="owner"):
    """Create a business with one user and return (business, user, auth headers)."""
    business = Business(name=name)
    db.session.add(business)
    db.session.flush()
    user = User(business_id=business.id, name="Owner", email=email,
                password_hash="not-used-in-these-tests", role=role)
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=user.id)
    return business, user, {"Authorization": f"Bearer {token}"}


def move(product, user, movement_type, quantity):
    db.session.add(StockMovement(product_id=product.id, user_id=user.id,
                                 movement_type=movement_type, quantity=quantity))


@pytest.fixture
def shop(app):
    return make_shop("Kimironko Mini Market", "owner@kimironko.rw")


def test_valuation_with_two_products(client, shop):
    business, user, headers = shop
    sugar = Product(business_id=business.id, name="Sugar 1kg", unit_cost=1500)
    rice = Product(business_id=business.id, name="Rice 5kg", unit_cost=7000)
    db.session.add_all([sugar, rice])
    db.session.flush()
    move(sugar, user, "purchase", 20)
    move(sugar, user, "sale", 5)        # sugar: 15 left x 1,500 = 22,500
    move(rice, user, "purchase", 10)
    move(rice, user, "damage", 1)
    move(rice, user, "return", 1)       # rice: 10 left x 7,000 = 70,000
    db.session.commit()

    r = client.get("/api/reports/valuation", headers=headers)

    assert r.status_code == 200
    body = r.get_json()
    assert body["currency"] == "RWF"
    assert body["total_value"] == 92_500
    assert body["product_count"] == 2
    by_name = {item["name"]: item for item in body["items"]}
    assert by_name["Sugar 1kg"]["stock"] == 15
    assert by_name["Sugar 1kg"]["value"] == 22_500
    assert by_name["Rice 5kg"]["stock"] == 10
    assert by_name["Rice 5kg"]["value"] == 70_000


def test_empty_business_is_worth_zero(client, shop):
    _, _, headers = shop
    body = client.get("/api/reports/valuation", headers=headers).get_json()
    assert body["total_value"] == 0
    assert body["items"] == []


def test_product_without_movements_has_zero_stock(client, shop):
    business, _, headers = shop
    db.session.add(Product(business_id=business.id, name="Soap", unit_cost=800))
    db.session.commit()
    body = client.get("/api/reports/valuation", headers=headers).get_json()
    assert body["items"][0]["stock"] == 0
    assert body["total_value"] == 0


def test_negative_stock_counts_as_zero_and_is_flagged(client, shop):
    business, user, headers = shop
    oil = Product(business_id=business.id, name="Cooking oil 1L", unit_cost=3000)
    db.session.add(oil)
    db.session.flush()
    move(oil, user, "purchase", 2)
    move(oil, user, "sale", 5)          # -3: more sold than ever came in
    db.session.commit()

    body = client.get("/api/reports/valuation", headers=headers).get_json()
    assert body["items"][0]["stock"] == -3
    assert body["items"][0]["value"] == 0
    assert body["total_value"] == 0
    assert body["warnings"]["negative_stock"] == [oil.id]


def test_missing_unit_cost_is_flagged(client, shop):
    business, user, headers = shop
    milk = Product(business_id=business.id, name="Inyange milk 500ml")
    db.session.add(milk)
    db.session.flush()
    move(milk, user, "purchase", 12)
    db.session.commit()

    body = client.get("/api/reports/valuation", headers=headers).get_json()
    assert body["warnings"]["missing_unit_cost"] == [milk.id]


def test_other_business_products_are_not_counted(client, shop):
    business, user, headers = shop
    mine = Product(business_id=business.id, name="Mine", unit_cost=100)
    db.session.add(mine)
    db.session.flush()
    move(mine, user, "purchase", 1)

    other_business, other_user, _ = make_shop("Nyarugenge Shop", "owner@nyarugenge.rw")
    theirs = Product(business_id=other_business.id, name="Theirs", unit_cost=1_000_000)
    db.session.add(theirs)
    db.session.flush()
    move(theirs, other_user, "purchase", 50)
    db.session.commit()

    body = client.get("/api/reports/valuation", headers=headers).get_json()
    assert body["total_value"] == 100
    assert [item["name"] for item in body["items"]] == ["Mine"]


def test_requires_login(client, shop):
    assert client.get("/api/reports/valuation").status_code == 401


def test_staff_cannot_see_valuation(client, app):
    _, _, headers = make_shop("Remera Boutique", "staff@remera.rw", role="staff")
    assert client.get("/api/reports/valuation", headers=headers).status_code == 403


def test_products_api_saves_unit_cost(client, shop):
    business, _, headers = shop
    r = client.post("/api/products", headers=headers,
                    json={"name": "Sugar 1kg", "business_id": business.id, "unit_cost": 1500})
    assert r.status_code == 201
    assert r.get_json()["unit_cost"] == 1500
