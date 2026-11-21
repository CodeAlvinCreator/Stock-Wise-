from flask_jwt_extended import create_access_token

from app import db
from app.models import Business, User


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
