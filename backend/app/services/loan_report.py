"""Loan-readiness report: the numbers a lender asks for, as a PDF.

build_loan_report() gathers everything into a plain dict, so the numbers can
be unit tested without reading a PDF. render_loan_report_pdf() only lays the
dict out on the page.
"""

from collections import Counter
from datetime import datetime, time, timedelta
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import case, func

from app import db
from app.models import AuditLog, Discrepancy, Product, StockCount
from app.services.audit import recent_audit_logs

RECENT_ACTIONS = 20
PRIMARY = colors.HexColor("#0E1B2E")


def _percent(part, whole):
    return round(part * 100 / whole, 1) if whole else None


def _discrepancy_summary(business_id, since, until):
    rows = (
        db.session.query(Discrepancy, Product.unit_cost)
        .join(Product, Discrepancy.product_id == Product.id)
        .filter(
            Product.business_id == business_id,
            Discrepancy.created_at >= since,
            Discrepancy.created_at < until,
        )
        .all()
    )
    causes = Counter(d.cause or "not_investigated" for d, _ in rows)
    resolved = sum(1 for d, _ in rows if d.status == "resolved")
    return {
        "count": len(rows),
        "total_units": sum(abs(d.difference) for d, _ in rows),
        # Only shortages lose money. A surplus is a record-keeping error, not a gain.
        "value_lost": sum(-d.difference * (cost or 0) for d, cost in rows if d.difference < 0),
        "by_cause": sorted(causes.items(), key=lambda item: (-item[1], item[0])),
        "resolved_percent": _percent(resolved, len(rows)),
    }


def _count_accuracy(business_id, since, until):
    total, exact = (
        db.session.query(
            func.count(StockCount.id),
            func.coalesce(
                func.sum(
                    case(
                        (StockCount.counted_quantity == StockCount.expected_quantity, 1),
                        else_=0,
                    )
                ),
                0,
            ),
        )
        .join(Product, StockCount.product_id == Product.id)
        .filter(
            Product.business_id == business_id,
            StockCount.created_at >= since,
            StockCount.created_at < until,
        )
        .one()
    )
    return {"counts": total, "exact": int(exact), "accuracy_percent": _percent(exact, total)}


def _audit_summary(business_id, since, until):
    total = (
        db.session.query(func.count(AuditLog.id))
        .filter(
            AuditLog.business_id == business_id,
            AuditLog.created_at >= since,
            AuditLog.created_at < until,
        )
        .scalar()
    )
    recent = recent_audit_logs(business_id, RECENT_ACTIONS, since, until)
    return {
        "total": total,
        "recent": [
            {"action": e.action, "user_name": name, "created_at": e.created_at}
            for e, name in recent
        ],
    }


def build_loan_report(business, valuation, start_date, end_date):
    """Report for the dates start_date to end_date, both included.

    `valuation` is the dict from build_valuation, passed in so this module
    doesn't depend on the reports routes.
    """
    # Timestamps are stored as naive UTC, so the bounds are naive UTC too.
    since = datetime.combine(start_date, time.min)
    until = datetime.combine(end_date + timedelta(days=1), time.min)
    return {
        "business_name": business.name,
        "start_date": start_date,
        "end_date": end_date,
        "valuation": valuation,
        "discrepancies": _discrepancy_summary(business.id, since, until),
        "accuracy": _count_accuracy(business.id, since, until),
        "audit": _audit_summary(business.id, since, until),
    }


def format_rwf(amount):
    return f"{amount:,} RWF"


def _cause_label(cause):
    return cause.replace("_", " ").capitalize()


def _table(rows, col_widths, numeric_columns=()):
    table = Table(rows, colWidths=col_widths, repeatRows=1, spaceBefore=3 * mm)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F6F5")]),
    ]
    style += [("ALIGN", (col, 0), (col, -1), "RIGHT") for col in numeric_columns]
    table.setStyle(TableStyle(style))
    return table


def render_loan_report_pdf(report, generated_on):
    styles = getSampleStyleSheet()
    body, heading = styles["BodyText"], styles["Heading2"]

    def text(value):
        # Product and user names are typed by people. Paragraph reads its text
        # as markup, so they are escaped to stop a name like "<b>" breaking the PDF.
        return Paragraph(escape(str(value)), body)

    valuation = report["valuation"]
    summary = report["discrepancies"]
    accuracy = report["accuracy"]
    audit = report["audit"]
    period = f"{report['start_date']:%d %b %Y} to {report['end_date']:%d %b %Y}"

    story = [
        Paragraph(f"Loan-readiness report: {escape(report['business_name'])}", styles["Title"]),
        Paragraph(f"Report date: {generated_on:%d %B %Y}. Period covered: {period}.", body),
        Spacer(1, 6 * mm),
        Paragraph("Stock value", heading),
        Paragraph(
            f"Total stock value today: <b>{format_rwf(valuation['total_value'])}</b> across "
            f"{valuation['product_count']} products, calculated from every recorded movement.",
            body,
        ),
    ]
    if valuation["items"]:
        rows = [["Product", "Stock", "Unit cost", "Value"]] + [
            [text(item["name"]), f"{item['stock']:,}", format_rwf(item["unit_cost"]),
             format_rwf(item["value"])]
            for item in valuation["items"]
        ]
        story.append(_table(rows, [75 * mm, 25 * mm, 35 * mm, 40 * mm], numeric_columns=(1, 2, 3)))

    story += [
        Paragraph("Discrepancies", heading),
        Paragraph(
            f"{summary['count']} discrepancies, {summary['total_units']:,} units in total. "
            f"Value lost to shortages: <b>{format_rwf(summary['value_lost'])}</b>. "
            + (
                f"Resolved: {summary['resolved_percent']}%."
                if summary["resolved_percent"] is not None
                else "No discrepancies in this period."
            ),
            body,
        ),
    ]
    if summary["by_cause"]:
        rows = [["Cause", "Discrepancies"]] + [
            [_cause_label(cause), str(number)] for cause, number in summary["by_cause"]
        ]
        story.append(_table(rows, [100 * mm, 40 * mm], numeric_columns=(1,)))

    story += [
        Paragraph("Inventory accuracy", heading),
        Paragraph(
            f"{accuracy['exact']} of {accuracy['counts']} stock counts matched the records "
            f"exactly: <b>{accuracy['accuracy_percent']}%</b> accuracy."
            if accuracy["accuracy_percent"] is not None
            else "No stock counts in this period.",
            body,
        ),
        Paragraph("Audit trail", heading),
        Paragraph(
            f"{audit['total']} actions were logged in this period. The latest "
            f"{len(audit['recent'])} are listed below."
            if audit["recent"]
            else "No actions were logged in this period.",
            body,
        ),
    ]
    if audit["recent"]:
        rows = [["When (UTC)", "Who", "Action"]] + [
            [f"{entry['created_at']:%d %b %Y %H:%M}", text(entry["user_name"] or "-"),
             entry["action"]]
            for entry in audit["recent"]
        ]
        story.append(_table(rows, [40 * mm, 60 * mm, 75 * mm]))

    buffer = BytesIO()
    SimpleDocTemplate(
        buffer, pagesize=A4, title=f"Loan-readiness report - {report['business_name']}",
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
    ).build(story)
    return buffer.getvalue()
