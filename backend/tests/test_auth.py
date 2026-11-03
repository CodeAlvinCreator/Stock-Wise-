NEW_USER = {
    "name": "Test User",
    "email": "a@b.com",
    "password": "secret123",
    "business_name": "Test Shop",
}


def test_login_works(client):
    client.post("/api/auth/register", json=NEW_USER)
    r = client.post("/api/auth/login", json={"email": "a@b.com", "password": "secret123"})
    assert r.status_code == 200
    assert "access_token" in r.get_json()


def test_wrong_password_rejected(client):
    client.post("/api/auth/register", json=NEW_USER)
    r = client.post("/api/auth/login", json={"email": "a@b.com", "password": "wrong"})
    assert r.status_code == 401


def test_cannot_choose_own_role(client):
    r = client.post("/api/auth/register", json={**NEW_USER, "role": "admin"})
    assert r.status_code == 201
    assert r.get_json()["role"] == "owner"


def test_joining_business_needs_owner_token(client):
    owner = client.post("/api/auth/register", json=NEW_USER).get_json()
    new_staff = {"name": "Staff", "email": "s@b.com", "password": "pw123456",
                 "business_id": owner["business_id"]}

    r = client.post("/api/auth/register", json=new_staff)
    assert r.status_code == 403

    token = client.post("/api/auth/login", json={"email": "a@b.com", "password": "secret123"}
                        ).get_json()["access_token"]
    r = client.post("/api/auth/register", json=new_staff,
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    assert r.get_json()["role"] == "staff"
