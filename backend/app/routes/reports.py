"""Financial reports for the loan-readiness feature.

GET /api/reports/loan-readiness?from=YYYY-MM-DD&to=YYYY-MM-DD
    The same valuation plus discrepancy, accuracy and audit summaries, as a
    PDF the owner can hand to a lender. See app/services/loan_report.py.

GET /api/reports/valuation
    Total inventory value for the logged-in owner's business:
        total value = sum over products of (current stock x unit cost)

    Current stock is never read from Product.quantity_on_hand. It is
    recalculated from the stock_movements ledger, the same rule used by the
    movements API: purchases and returns add stock, sales and damage remove it.
    A lender can trust a ledger total more than a number anyone can overwrite.
"""

from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from flask import Blueprint, jsonify, request, send_file
from flask_jwt_extended import current_user, jwt_required

from app import db
from app.errors import ValidationError
from app.models import Business, Product
from app.services.access import require_owner
from app.services.loan_report import build_loan_report, render_loan_report_pdf
from app.services.stock import stock_by_product

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

CURRENCY = "RWF"
DEFAULT_REPORT_DAYS = 90


def build_valuation(business_id):
    """Build the valuation report as a plain dict (easy to unit test and to
    reuse later inside the loan-readiness PDF)."""
    products = (
        Product.query.filter_by(business_id=business_id).order_by(Product.name).all()
    )
    stock = stock_by_product(business_id)

    items = []
    negative_stock = []
    total_value = 0

    for product in products:
        quantity = stock.get(product.id, 0)
        unit_cost = product.unit_cost or 0

        # A negative balance means more sales or damage were recorded than
        # stock ever came in. That is a record-keeping error, not stock that
        # has value, so it counts as 0 and is listed for the owner to fix.
        if quantity < 0:
            negative_stock.append(product.id)
            value = 0
        else:
            value = quantity * unit_cost

        total_value += value
        items.append(
            {
                "product_id": product.id,
                "name": product.name,
                "sku": product.sku,
                "unit": product.unit,
                "stock": quantity,
                "unit_cost": unit_cost,
                "value": value,
            }
        )

    missing_cost = [item["product_id"] for item in items if item["unit_cost"] == 0]

    return {
        "business_id": business_id,
        "currency": CURRENCY,
        "total_value": total_value,
        "product_count": len(items),
        "items": items,
        "warnings": {
            "negative_stock": negative_stock,
            "missing_unit_cost": missing_cost,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@reports_bp.get("/valuation")
@jwt_required()
def valuation():
    # Inventory value is financial data for loan applications, so only the
    # business owner can see it.
    require_owner(current_user, "only the business owner can view the valuation report")
    return jsonify(build_valuation(current_user.business_id)), 200


def _read_date(field, default):
    raw = request.args.get(field)
    if raw is None:
        return default
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ValidationError(field, f"{field} must be a date like 2026-11-30") from None


@reports_bp.get("/loan-readiness")
@jwt_required()
def loan_readiness():
    require_owner(current_user, "only the business owner can download the loan-readiness report")

    today = datetime.now(timezone.utc).date()
    end_date = _read_date("to", today)
    start_date = _read_date("from", end_date - timedelta(days=DEFAULT_REPORT_DAYS - 1))
    if start_date > end_date:
        raise ValidationError("from", "from must be on or before to")

    business = db.session.get(Business, current_user.business_id)
    report = build_loan_report(
        business, build_valuation(business.id), start_date, end_date
    )
    pdf = render_loan_report_pdf(report, generated_on=today)
    return send_file(
        BytesIO(pdf),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"stockwise-loan-readiness-{today.isoformat()}.pdf",
    )
