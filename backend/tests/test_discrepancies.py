from datetime import datetime, timedelta, timezone

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
from app.services.stock import current_stock


def _make_shop(name, email):
    business = Business(name=name)
    db.session.add(business)
    db.session.flush()
    user = User(business_id=business.id, name="Staff", email=email, password_hash="x")
    product = Product(business_id=business.id, name=f"{name} sugar", unit_cost=1000)
    db.session.add_all([user, product])
    db.session.flush()
    token = create_access_token(identity=user.id)
    return user, product, {"Authorization": f"Bearer {token}"}


def _make_discrepancy(user, product, difference, status="open", minutes_ago=0):
    count = StockCount(
        product_id=product.id,
        user_id=user.id,
        expected_quantity=10,
        counted_quantity=10 + difference,
    )
    db.session.add(count)
    db.session.flush()
    discrepancy = Discrepancy(
        stock_count_id=count.id,
        product_id=product.id,
        difference=difference,
        status=status,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
    )
    db.session.add(discrepancy)
    db.session.commit()
    return discrepancy.id


def _make_owner(business_id, email):
    owner = User(business_id=business_id, name="Owner", email=email, password_hash="x",
                 role="owner")
    db.session.add(owner)
    db.session.commit()
    return owner, {"Authorization": f"Bearer {create_access_token(identity=owner.id)}"}


@pytest.fixture
def shops(app):
    user, product, headers = _make_shop("Shop A", "a@example.com")
    other_user, other_product, other_headers = _make_shop("Shop B", "b@example.com")
    owner, owner_headers = _make_owner(user.business_id, "owner-a@example.com")
    _, other_owner_headers = _make_owner(other_user.business_id, "owner-b@example.com")
    return {
        "user": user,
        "product": product,
        "headers": headers,
        "owner": owner,
        "owner_headers": owner_headers,
        "other_user": other_user,
        "other_product": other_product,
        "other_headers": other_headers,
        "other_owner_headers": other_owner_headers,
    }


def _investigate(client, discrepancy_id, headers, cause="theft", finding="Two bags missing"):
    return client.post(
        f"/api/discrepancies/{discrepancy_id}/investigate",
        json={"cause": cause, "finding": finding},
        headers=headers,
    )


def test_count_uses_ledger_stock_not_quantity_on_hand(client, shops):
    product = shops["product"]
    product.quantity_on_hand = 99  # stale value that must be ignored
    db.session.add_all([
        StockMovement(product_id=product.id, user_id=shops["user"].id, movement_type="purchase", quantity=20),
        StockMovement(product_id=product.id, user_id=shops["user"].id, movement_type="sale", quantity=5),
    ])
    db.session.commit()

    response = client.post(
        "/api/counts",
        json={"product_id": product.id, "counted_quantity": 15},
        headers=shops["headers"],
    )

    assert response.status_code == 201
    body = response.get_json()
    assert body["count"]["expected_quantity"] == 15
    assert body["discrepancy"] is None


def test_list_returns_only_own_business(client, shops):
    own_id = _make_discrepancy(shops["user"], shops["product"], -2)
    _make_discrepancy(shops["other_user"], shops["other_product"], -4)

    response = client.get("/api/discrepancies", headers=shops["headers"])

    assert response.status_code == 200
    ids = [d["id"] for d in response.get_json()["discrepancies"]]
    assert ids == [own_id]


def test_list_is_newest_first_with_product_and_value(client, shops):
    older_id = _make_discrepancy(shops["user"], shops["product"], -2, minutes_ago=10)
    newer_id = _make_discrepancy(shops["user"], shops["product"], 3, minutes_ago=1)

    items = client.get("/api/discrepancies", headers=shops["headers"]).get_json()["discrepancies"]

    assert [d["id"] for d in items] == [newer_id, older_id]
    assert items[0]["product_name"] == "Shop A sugar"
    assert items[0]["value_rwf"] == 3000
    assert items[1]["value_rwf"] == -2000


def test_status_filter_works(client, shops):
    open_id = _make_discrepancy(shops["user"], shops["product"], -1)
    _make_discrepancy(shops["user"], shops["product"], -2, status="investigated")

    response = client.get("/api/discrepancies?status=open", headers=shops["headers"])

    assert [d["id"] for d in response.get_json()["discrepancies"]] == [open_id]


def test_unknown_status_returns_400(client, shops):
    response = client.get("/api/discrepancies?status=closed", headers=shops["headers"])
    assert response.status_code == 400


def test_investigate_happy_path(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)

    response = _investigate(client, discrepancy_id, shops["headers"])

    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "investigated"
    assert body["cause"] == "theft"
    assert body["finding"] == "Two bags missing"
    assert body["investigated_at"] is not None
    saved = db.session.get(Discrepancy, discrepancy_id)
    assert saved.investigated_by == shops["user"].id


def test_bad_cause_returns_400(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)
    response = _investigate(client, discrepancy_id, shops["headers"], cause="aliens")
    assert response.status_code == 400


def test_empty_finding_returns_400(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)
    response = _investigate(client, discrepancy_id, shops["headers"], finding="   ")
    assert response.status_code == 400


def test_too_long_finding_returns_400(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)
    response = _investigate(client, discrepancy_id, shops["headers"], finding="x" * 1001)
    assert response.status_code == 400


def test_investigating_twice_returns_409(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)
    _investigate(client, discrepancy_id, shops["headers"])

    response = _investigate(client, discrepancy_id, shops["headers"])

    assert response.status_code == 409


def test_other_business_discrepancy_returns_404(client, shops):
    other_id = _make_discrepancy(shops["other_user"], shops["other_product"], -2)
    response = _investigate(client, other_id, shops["headers"])
    assert response.status_code == 404


def _resolve(client, discrepancy_id, headers):
    return client.post(f"/api/discrepancies/{discrepancy_id}/resolve", headers=headers)


def _stock_up(shops, quantity):
    db.session.add(StockMovement(product_id=shops["product"].id, user_id=shops["user"].id,
                                 movement_type="purchase", quantity=quantity))
    db.session.commit()


def test_owner_can_list_discrepancies_too(client, shops):
    own_id = _make_discrepancy(shops["user"], shops["product"], -2)
    response = client.get("/api/discrepancies", headers=shops["owner_headers"])
    assert [d["id"] for d in response.get_json()["discrepancies"]] == [own_id]


def test_list_requires_token(client, shops):
    response = client.get("/api/discrepancies")
    assert response.status_code == 401
    assert "error" in response.get_json()


def test_expired_token_gets_clean_401(client, shops):
    token = create_access_token(identity=shops["user"].id, expires_delta=timedelta(seconds=-1))
    response = client.get("/api/discrepancies", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.get_json() == {"error": "your session has expired, please log in again"}


def test_bad_cause_names_the_field(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)
    body = _investigate(client, discrepancy_id, shops["headers"], cause="aliens").get_json()
    assert body["field"] == "cause"
    assert "unrecorded_sale" in body["error"]


def test_missing_finding_returns_400(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)
    response = client.post(f"/api/discrepancies/{discrepancy_id}/investigate",
                           json={"cause": "theft"}, headers=shops["headers"])
    assert response.status_code == 400
    assert response.get_json()["field"] == "finding"


def test_investigate_writes_audit_row(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)
    _investigate(client, discrepancy_id, shops["headers"])

    rows = AuditLog.query.filter_by(action="discrepancy.investigated").all()
    assert len(rows) == 1
    assert rows[0].entity_id == discrepancy_id
    assert rows[0].user_id == shops["user"].id


def test_resolve_shortage_corrects_stock_to_counted_figure(client, shops):
    _stock_up(shops, 10)
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)
    _investigate(client, discrepancy_id, shops["headers"])

    response = _resolve(client, discrepancy_id, shops["owner_headers"])

    assert response.status_code == 200
    body = response.get_json()
    assert body["discrepancy"]["status"] == "resolved"
    assert body["discrepancy"]["resolved_at"] is not None
    assert body["stock_after"] == 8
    product = db.session.get(Product, shops["product"].id)
    assert product.quantity_on_hand == 8
    assert current_stock(product.id) == 8
    correction = db.session.get(StockMovement, body["movement_id"])
    assert (correction.movement_type, correction.quantity) == ("adjustment_out", 2)
    assert db.session.get(Discrepancy, discrepancy_id).resolved_by == shops["owner"].id


def test_resolve_surplus_adds_stock(client, shops):
    _stock_up(shops, 10)
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], 3)
    _investigate(client, discrepancy_id, shops["headers"])

    body = _resolve(client, discrepancy_id, shops["owner_headers"]).get_json()

    assert body["stock_after"] == 13
    assert db.session.get(StockMovement, body["movement_id"]).movement_type == "adjustment_in"


def test_resolve_writes_audit_row(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2,
                                       status="investigated")
    _resolve(client, discrepancy_id, shops["owner_headers"])

    rows = AuditLog.query.filter_by(action="discrepancy.resolved").all()
    assert len(rows) == 1
    assert rows[0].user_id == shops["owner"].id


def test_staff_cannot_resolve(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2,
                                       status="investigated")
    response = _resolve(client, discrepancy_id, shops["headers"])
    assert response.status_code == 403
    assert db.session.get(Discrepancy, discrepancy_id).status == "investigated"


def test_open_discrepancy_cannot_be_resolved(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2)
    response = _resolve(client, discrepancy_id, shops["owner_headers"])
    assert response.status_code == 409
    assert StockMovement.query.count() == 0


def test_resolving_twice_corrects_stock_once(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2,
                                       status="investigated")
    assert _resolve(client, discrepancy_id, shops["owner_headers"]).status_code == 200
    assert _resolve(client, discrepancy_id, shops["owner_headers"]).status_code == 409
    assert StockMovement.query.filter_by(movement_type="adjustment_out").count() == 1


def test_other_business_cannot_resolve(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2,
                                       status="investigated")
    response = _resolve(client, discrepancy_id, shops["other_owner_headers"])
    assert response.status_code == 404


def test_resolve_requires_token(client, shops):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2,
                                       status="investigated")
    assert client.post(f"/api/discrepancies/{discrepancy_id}/resolve").status_code == 401


def test_failed_resolve_saves_nothing(client, shops, monkeypatch):
    discrepancy_id = _make_discrepancy(shops["user"], shops["product"], -2,
                                       status="investigated")

    def broken_log_action(*args, **kwargs):
        raise RuntimeError("audit table is down")

    monkeypatch.setattr("app.routes.discrepancies.log_action", broken_log_action)
    response = _resolve(client, discrepancy_id, shops["owner_headers"])

    assert response.status_code == 500
    assert response.get_json() == {"error": "something went wrong on the server"}
    assert db.session.get(Discrepancy, discrepancy_id).status == "investigated"
    assert StockMovement.query.count() == 0
