import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import (
    AuditLog,
    Business,
    Discrepancy,
    Product,
    StockCount,
    StockMovement,
    User,
)
from app.services.passwords import hash_password

PASSWORD = "secret123"
# Hashed once, because bcrypt is slow on purpose and every test makes four users.
PASSWORD_HASH = hash_password(PASSWORD)


def make_user(business, email, role):
    user = User(business_id=business.id, name=email.split("@")[0], email=email,
                password_hash=PASSWORD_HASH, role=role)
    db.session.add(user)
    db.session.flush()
    return user


def headers_for(user):
    return {"Authorization": f"Bearer {create_access_token(identity=user.id)}"}


def make_shop(name, owner_email, staff_email):
    business = Business(name=name)
    db.session.add(business)
    db.session.flush()
    owner = make_user(business, owner_email, "owner")
    staff = make_user(business, staff_email, "staff")
    product = Product(business_id=business.id, name="Sugar", unit_cost=1000)
    db.session.add(product)
    db.session.flush()
    movement = StockMovement(product_id=product.id, user_id=staff.id,
                             movement_type="purchase", quantity=10)
    count = StockCount(product_id=product.id, user_id=staff.id,
                       expected_quantity=10, counted_quantity=8)
    db.session.add_all([movement, count])
    db.session.flush()
    db.session.add(Discrepancy(stock_count_id=count.id, product_id=product.id, difference=-2,
                               status="resolved", investigated_by=staff.id,
                               resolved_by=owner.id))
    db.session.add(AuditLog(business_id=business.id, user_id=staff.id, action="count.created"))
    db.session.commit()
    return {"business": business, "owner": owner, "staff": staff, "movement": movement}


@pytest.fixture
def shops(app):
    return {
        "a": make_shop("Kimironko Mini Market", "owner@a.rw", "staff@a.rw"),
        "b": make_shop("Nyabugogo Stall", "owner@b.rw", "staff@b.rw"),
    }


# ---------- Owner removes a staff member ----------

def test_owner_removes_staff_and_history_is_kept(client, shops):
    a = shops["a"]
    staff_id = a["staff"].id

    r = client.delete(f"/api/auth/team/{staff_id}", headers=headers_for(a["owner"]))

    assert r.status_code == 204
    removed = db.session.get(User, staff_id)
    assert not removed.is_active
    assert removed.name == "Removed user"
    assert removed.email != "staff@a.rw"
    assert removed.deactivated_at is not None
    # Their past work still points at them.
    assert db.session.get(StockMovement, a["movement"].id).user_id == staff_id
    log = AuditLog.query.filter_by(action="user.removed").one()
    assert (log.entity_id, log.user_id) == (staff_id, a["owner"].id)


def test_removed_staff_token_stops_working(client, shops):
    a = shops["a"]
    staff_headers = headers_for(a["staff"])
    client.delete(f"/api/auth/team/{a['staff'].id}", headers=headers_for(a["owner"]))

    r = client.get("/api/products", headers=staff_headers)

    assert r.status_code == 401
    assert r.get_json() == {"error": "this account no longer exists"}


def test_removed_staff_cannot_log_in_and_email_is_free_again(client, shops):
    a = shops["a"]
    client.delete(f"/api/auth/team/{a['staff'].id}", headers=headers_for(a["owner"]))

    login = client.post("/api/auth/login", json={"email": "staff@a.rw", "password": PASSWORD})
    again = client.post("/api/auth/register", headers=headers_for(a["owner"]),
                        json={"name": "Back", "email": "staff@a.rw", "password": "newpass123",
                              "business_id": a["business"].id})

    assert login.status_code == 401
    assert again.status_code == 201


def test_removed_staff_leaves_team_list(client, shops):
    a = shops["a"]
    client.delete(f"/api/auth/team/{a['staff'].id}", headers=headers_for(a["owner"]))
    users = client.get("/api/auth/team", headers=headers_for(a["owner"])).get_json()["users"]
    assert [u["email"] for u in users] == ["owner@a.rw"]


def test_staff_cannot_remove_anyone(client, shops):
    a = shops["a"]
    r = client.delete(f"/api/auth/team/{a['owner'].id}", headers=headers_for(a["staff"]))
    assert r.status_code == 403


def test_owner_cannot_remove_another_business_staff(client, shops):
    r = client.delete(f"/api/auth/team/{shops['b']['staff'].id}",
                      headers=headers_for(shops["a"]["owner"]))
    assert r.status_code == 404
    assert db.session.get(User, shops["b"]["staff"].id).is_active


def test_owner_cannot_remove_themselves(client, shops):
    owner = shops["a"]["owner"]
    r = client.delete(f"/api/auth/team/{owner.id}", headers=headers_for(owner))
    assert r.status_code == 400
    assert db.session.get(User, owner.id).is_active


def test_owner_cannot_remove_a_co_owner(client, shops):
    a = shops["a"]
    co_owner = make_user(a["business"], "co@a.rw", "owner")
    db.session.commit()
    r = client.delete(f"/api/auth/team/{co_owner.id}", headers=headers_for(a["owner"]))
    assert r.status_code == 403


def test_removing_twice_returns_404(client, shops):
    a = shops["a"]
    client.delete(f"/api/auth/team/{a['staff'].id}", headers=headers_for(a["owner"]))
    r = client.delete(f"/api/auth/team/{a['staff'].id}", headers=headers_for(a["owner"]))
    assert r.status_code == 404


def test_remove_requires_token(client, shops):
    assert client.delete(f"/api/auth/team/{shops['a']['staff'].id}").status_code == 401


# ---------- Account details ----------

def test_account_shows_business_name(client, shops):
    r = client.get("/api/account", headers=headers_for(shops["a"]["staff"]))
    assert r.status_code == 200
    assert r.get_json()["business_name"] == "Kimironko Mini Market"


# ---------- Staff deletes their own account ----------

def test_staff_deletes_own_account(client, shops):
    staff = shops["a"]["staff"]
    headers = headers_for(staff)

    r = client.delete("/api/account", json={"password": PASSWORD}, headers=headers)

    assert r.status_code == 204
    assert not db.session.get(User, staff.id).is_active
    assert client.get("/api/products", headers=headers).status_code == 401
    log = AuditLog.query.filter_by(action="user.removed").one()
    assert log.user_id == staff.id


@pytest.mark.parametrize("body", [{"password": "wrong-pass1"}, {}, {"password": 12345678}])
def test_own_account_needs_the_right_password(client, shops, body):
    staff = shops["a"]["staff"]
    r = client.delete("/api/account", json=body, headers=headers_for(staff))
    assert r.status_code == 403
    assert r.get_json() == {"error": "password is incorrect", "field": "password"}
    assert db.session.get(User, staff.id).is_active


def test_owner_cannot_delete_only_their_own_account(client, shops):
    owner = shops["a"]["owner"]
    r = client.delete("/api/account", json={"password": PASSWORD}, headers=headers_for(owner))
    assert r.status_code == 403
    assert db.session.get(User, owner.id).is_active


def test_delete_own_account_requires_token(client, shops):
    assert client.delete("/api/account", json={"password": PASSWORD}).status_code == 401


# ---------- Owner deletes the whole business ----------

def _delete_business(client, owner, password=PASSWORD, name="Kimironko Mini Market"):
    return client.delete("/api/account/business", headers=headers_for(owner),
                         json={"password": password, "business_name": name})


def test_owner_deletes_business_and_everything_in_it(client, shops):
    a, b = shops["a"], shops["b"]
    business_id, other_id = a["business"].id, b["business"].id
    headers = headers_for(a["owner"])

    r = _delete_business(client, a["owner"])

    assert r.status_code == 204
    assert db.session.get(Business, business_id) is None
    assert User.query.filter_by(business_id=business_id).count() == 0
    assert Product.query.filter_by(business_id=business_id).count() == 0
    assert AuditLog.query.filter_by(business_id=business_id).count() == 0
    # Exactly one shop's worth of rows is left: the other business's.
    assert (StockMovement.query.count(), StockCount.query.count(),
            Discrepancy.query.count()) == (1, 1, 1)
    assert db.session.get(Business, other_id) is not None
    assert client.get("/api/products", headers=headers).status_code == 401


def test_business_name_with_extra_spaces_is_accepted(client, shops):
    r = _delete_business(client, shops["a"]["owner"], name="  Kimironko Mini Market ")
    assert r.status_code == 204


def test_wrong_password_keeps_the_business(client, shops):
    r = _delete_business(client, shops["a"]["owner"], password="wrong-pass1")
    assert r.status_code == 403
    assert r.get_json()["field"] == "password"
    assert db.session.get(Business, shops["a"]["business"].id) is not None


@pytest.mark.parametrize("name", ["Kimironko", "kimironko mini market", "Nyabugogo Stall", ""])
def test_wrong_business_name_keeps_the_business(client, shops, name):
    r = _delete_business(client, shops["a"]["owner"], name=name)
    assert r.status_code == 400
    assert r.get_json()["field"] == "business_name"
    assert db.session.get(Business, shops["a"]["business"].id) is not None


def test_staff_cannot_delete_the_business(client, shops):
    r = _delete_business(client, shops["a"]["staff"])
    assert r.status_code == 403
    assert db.session.get(Business, shops["a"]["business"].id) is not None


def test_owner_cannot_delete_another_business(client, shops):
    # The business always comes from the token's user, so naming another
    # shop only fails the name check and leaves both shops alone.
    r = _delete_business(client, shops["a"]["owner"], name="Nyabugogo Stall")
    assert r.status_code == 400
    assert db.session.get(Business, shops["b"]["business"].id) is not None


def test_delete_business_requires_token(client, shops):
    r = client.delete("/api/account/business",
                      json={"password": PASSWORD, "business_name": "Kimironko Mini Market"})
    assert r.status_code == 401
