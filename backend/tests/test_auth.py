import pytest

from app.models import AuditLog


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


def _owner_token(client):
    owner = client.post("/api/auth/register", json=NEW_USER).get_json()
    token = client.post("/api/auth/login", json={"email": "a@b.com", "password": "secret123"}
                        ).get_json()["access_token"]
    return owner, {"Authorization": f"Bearer {token}"}


def _add_staff(client, owner, headers):
    client.post("/api/auth/register", headers=headers,
                json={"name": "Staff", "email": "s@b.com", "password": "pw123456",
                      "business_id": owner["business_id"]})
    token = client.post("/api/auth/login", json={"email": "s@b.com", "password": "pw123456"}
                        ).get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize(
    "changes, field",
    [
        ({"email": "not-an-email"}, "email"),
        ({"password": "short"}, "password"),
        ({"password": "x" * 73}, "password"),
        ({"name": ""}, "name"),
        ({"name": "x" * 121}, "name"),
        ({"business_name": None}, "business_name"),
    ],
)
def test_register_rejects_bad_input(client, changes, field):
    r = client.post("/api/auth/register", json={**NEW_USER, **changes})
    assert r.status_code == 400
    assert r.get_json()["field"] == field


def test_duplicate_email_returns_409(client):
    client.post("/api/auth/register", json=NEW_USER)
    assert client.post("/api/auth/register", json=NEW_USER).status_code == 409


def test_login_without_fields_returns_400(client):
    assert client.post("/api/auth/login", json={}).status_code == 400


def test_owner_adding_staff_is_audited(client):
    owner, headers = _owner_token(client)
    new_staff = {"name": "Staff", "email": "s@b.com", "password": "pw123456",
                 "business_id": owner["business_id"]}

    staff = client.post("/api/auth/register", json=new_staff, headers=headers).get_json()

    rows = AuditLog.query.filter_by(action="user.created").all()
    assert len(rows) == 1
    assert rows[0].entity_id == staff["id"]
    assert rows[0].user_id == owner["id"]


def test_staff_cannot_add_users(client):
    owner, headers = _owner_token(client)
    staff_headers = _add_staff(client, owner, headers)

    r = client.post("/api/auth/register",
                    json={"name": "Another", "email": "x@b.com", "password": "pw123456",
                          "business_id": owner["business_id"]},
                    headers=staff_headers)

    assert r.status_code == 403


def test_owner_cannot_add_users_to_another_business(client):
    _, headers = _owner_token(client)
    other = client.post("/api/auth/register",
                        json={**NEW_USER, "email": "o@b.com", "business_name": "Other"}
                        ).get_json()

    r = client.post("/api/auth/register", headers=headers,
                    json={"name": "Spy", "email": "spy@b.com", "password": "pw123456",
                          "business_id": other["business_id"]})

    assert r.status_code == 403


def test_owner_lists_own_team(client):
    owner, headers = _owner_token(client)
    _add_staff(client, owner, headers)
    client.post("/api/auth/register", json={**NEW_USER, "email": "o@b.com",
                                            "business_name": "Other"})

    r = client.get("/api/auth/team", headers=headers)

    assert r.status_code == 200
    assert sorted(u["email"] for u in r.get_json()["users"]) == ["a@b.com", "s@b.com"]


def test_staff_cannot_list_team(client):
    owner, headers = _owner_token(client)
    staff_headers = _add_staff(client, owner, headers)

    r = client.get("/api/auth/team", headers=staff_headers)

    assert r.status_code == 403


def test_team_requires_token(client):
    assert client.get("/api/auth/team").status_code == 401
