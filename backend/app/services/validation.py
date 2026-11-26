import re
import uuid

from flask import request

from app.errors import ValidationError

# Largest value a PostgreSQL INTEGER column can hold. Anything bigger would
# crash the insert, so it is rejected as bad input instead.
MAX_INT = 2_147_483_647
# Not a full RFC check, just enough to catch typos like a missing "@" or domain.
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def json_body():
    """The request body as a dict. No body counts as empty, a list or a string is a 400."""
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValidationError(None, "request body must be a JSON object")
    return data


def read_string(data, field, max_length, required=False):
    """Return the trimmed string, or None when an optional field is missing or blank."""
    value = data.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ValidationError(field, f"{field} is required")
        return None
    if not isinstance(value, str):
        raise ValidationError(field, f"{field} must be text")
    value = value.strip()
    if len(value) > max_length:
        raise ValidationError(field, f"{field} must be at most {max_length} characters")
    return value


def normalize_email(value):
    """Emails are compared trimmed and lowercased, so "Favour@Shop.rw " and
    "favour@shop.rw" are the same account."""
    return value.strip().lower()


def read_email(data, field="email"):
    email = read_string(data, field, 255, required=True)
    if not EMAIL_PATTERN.match(email):
        raise ValidationError(field, f"{field} is not a valid address")
    return normalize_email(email)


def read_int(data, field, minimum=0, default=None):
    """Return a whole number of at least `minimum`, or `default` when the field is missing."""
    value = data.get(field)
    if value is None:
        if default is None:
            raise ValidationError(field, f"{field} is required")
        return default
    # bool is a subclass of int in Python, so reject it explicitly.
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= MAX_INT:
        raise ValidationError(
            field, f"{field} must be a whole number from {minimum} to {MAX_INT:,}"
        )
    return value


def read_uuid(data, field):
    """Return the canonical UUID string, None when missing, or a 400 when malformed."""
    value = data.get(field)
    if value is None:
        return None
    try:
        return str(uuid.UUID(value))
    except (TypeError, ValueError, AttributeError):
        raise ValidationError(field, f"{field} must be a valid UUID") from None
