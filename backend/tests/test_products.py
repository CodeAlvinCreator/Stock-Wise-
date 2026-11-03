from flask_jwt_extended import create_access_token

from app import db
from app.models import Business


def auth_headers():
    token = create_access_token(identity="test-user")
    return {"Authorization": f"Bearer {token}"}


def test_create_then_list_products(client):
    business = Business(name="Test Shop")
    db.session.add(business)
    db.session.commit()

    response = client.post(
        "/api/products",
        json={"name": "Rice", "business_id": business.id},
        headers=auth_headers(),
    )
    assert response.status_code == 201

    response = client.get("/api/products", headers=auth_headers())
    assert response.status_code == 200
    names = [p["name"] for p in response.get_json()]
    assert "Rice" in names