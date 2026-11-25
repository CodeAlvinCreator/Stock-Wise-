from datetime import date, datetime, timedelta, timezone

import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import Business, Discrepancy, Product, StockCount, StockMovement, User
from app.routes.reports import build_valuation
from app.services.audit import log_action
from app.services.loan_report import build_loan_report, format_rwf

TODAY = datetime.now(timezone.utc).date()


def make_user(business, email, role):
    user = User(business_id=business.id, name=email.split("@")[0], email=email,
                password_hash="x", role=role)
    db.session.add(user)
    db.session.flush()
    return user


def headers_for(user):
    return {"Authorization": f"Bearer {create_access_token(identity=user.id)}"}


def add_count(product, user, expected, counted, cause=None, status="open", days_ago=0):
    created = datetime.now(timezone.utc) - timedelta(days=days_ago)
    count = StockCount(product_id=product.id, user_id=user.id, expected_quantity=expected,
                       counted_quantity=counted, created_at=created)
    db.session.add(count)
    db.session.flush()
    if counted != expected:
        db.session.add(Discrepancy(stock_count_id=count.id, product_id=product.id,
                                   difference=counted - expected, cause=cause, status=status,
                                   created_at=created))


@pytest.fixture
def shop(app):
    business = Business(name="Kimironko Mini Market")
    db.session.add(business)
    db.session.flush()
    owner = make_user(business, "owner@shop.rw", "owner")
    staff = make_user(business, "staff@shop.rw", "staff")
    sugar = Product(business_id=business.id, name="Sugar 1kg", unit_cost=1500)
    rice = Product(business_id=business.id, name="Rice 5kg", unit_cost=7000)
    db.session.add_all([sugar, rice])
    db.session.flush()
    db.session.add_all([
        StockMovement(product_id=sugar.id, user_id=owner.id, movement_type="purchase",
                      quantity=20),
        StockMovement(product_id=rice.id, user_id=owner.id, movement_type="purchase",
                      quantity=10),
    ])
    add_count(sugar, staff, 20, 18, cause="theft", status="resolved")    # -2 x 1,500
    add_count(rice, staff, 10, 9, cause="theft")                         # -1 x 7,000
    add_count(rice, staff, 10, 11)                                       # surplus, no loss
    add_count(sugar, staff, 20, 20)                                      # exact match
    add_count(sugar, staff, 20, 10, days_ago=200)                        # outside the period
    log_action(owner, "product.created", "product", sugar.id)
    log_action(staff, "count.created", "count", "c-1")
    db.session.commit()
    return {"business": business, "owner": owner, "staff": staff}


def report_for(shop, start=None, end=TODAY):
    business = shop["business"]
    start = start or TODAY - timedelta(days=89)
    return build_loan_report(business, build_valuation(business.id), start, end)


def test_report_has_business_and_stock_value(shop):
    report = report_for(shop)
    assert report["business_name"] == "Kimironko Mini Market"
    assert report["valuation"]["total_value"] == 20 * 1500 + 10 * 7000


def test_discrepancy_summary_only_counts_the_period(shop):
    summary = report_for(shop)["discrepancies"]
    assert summary["count"] == 3
    assert summary["total_units"] == 4
    assert summary["value_lost"] == 2 * 1500 + 1 * 7000
    assert summary["by_cause"] == [("theft", 2), ("not_investigated", 1)]
    assert summary["resolved_percent"] == 33.3


def test_accuracy_is_exact_counts_over_all_counts(shop):
    accuracy = report_for(shop)["accuracy"]
    assert (accuracy["exact"], accuracy["counts"], accuracy["accuracy_percent"]) == (1, 4, 25.0)


def test_audit_summary_lists_actions_with_names(shop):
    audit = report_for(shop)["audit"]
    assert audit["total"] == 2
    assert {entry["user_name"] for entry in audit["recent"]} == {"owner", "staff"}


def test_empty_period_has_no_percentages(shop):
    report = report_for(shop, start=date(2020, 1, 1), end=date(2020, 1, 31))
    assert report["discrepancies"]["count"] == 0
    assert report["discrepancies"]["resolved_percent"] is None
    assert report["accuracy"]["accuracy_percent"] is None


def test_rwf_has_thousands_separators_and_no_decimals():
    assert format_rwf(1234567) == "1,234,567 RWF"


def test_owner_downloads_pdf(client, shop):
    response = client.get("/api/reports/loan-readiness", headers=headers_for(shop["owner"]))
    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert response.data.startswith(b"%PDF")
    assert "attachment" in response.headers["Content-Disposition"]


def test_date_range_is_accepted(client, shop):
    response = client.get("/api/reports/loan-readiness?from=2026-01-01&to=2026-03-31",
                          headers=headers_for(shop["owner"]))
    assert response.status_code == 200


def test_names_with_markup_do_not_break_the_pdf(client, shop):
    db.session.add(Product(business_id=shop["business"].id, name="<b>Soap & co", unit_cost=1))
    db.session.commit()
    response = client.get("/api/reports/loan-readiness", headers=headers_for(shop["owner"]))
    assert response.status_code == 200


@pytest.mark.parametrize(
    "query, field",
    [
        ("?from=yesterday", "from"),
        ("?to=2026-13-01", "to"),
        ("?from=2026-05-02&to=2026-05-01", "from"),
    ],
)
def test_bad_dates_return_400(client, shop, query, field):
    response = client.get(f"/api/reports/loan-readiness{query}",
                          headers=headers_for(shop["owner"]))
    assert response.status_code == 400
    assert response.get_json()["field"] == field


def test_staff_cannot_download(client, shop):
    response = client.get("/api/reports/loan-readiness", headers=headers_for(shop["staff"]))
    assert response.status_code == 403


def test_other_business_data_is_never_included(client, shop):
    other = Business(name="Other Shop")
    db.session.add(other)
    db.session.flush()
    other_owner = make_user(other, "other@shop.rw", "owner")
    db.session.commit()

    report = build_loan_report(other, build_valuation(other.id), TODAY - timedelta(days=89), TODAY)

    assert report["valuation"]["items"] == []
    assert report["discrepancies"]["count"] == 0
    assert report["audit"]["total"] == 0
    response = client.get("/api/reports/loan-readiness", headers=headers_for(other_owner))
    assert response.status_code == 200


def test_requires_token(client, shop):
    assert client.get("/api/reports/loan-readiness").status_code == 401
