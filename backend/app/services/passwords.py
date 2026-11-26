import re

import bcrypt

from app.errors import ValidationError

# The frontend shows the same rules and messages (frontend/src/passwordRules.ts).
MIN_PASSWORD_LENGTH = 8
# bcrypt refuses passwords longer than 72 bytes.
MAX_PASSWORD_BYTES = 72
HAS_LETTER = re.compile(r"[^\W\d_]")
HAS_DIGIT = re.compile(r"\d")


def read_new_password(data, field="password"):
    """A password for a new account, checked against every rule."""
    password = data.get(field)
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationError(field, f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        raise ValidationError(field, f"password must be at most {MAX_PASSWORD_BYTES} bytes")
    if not HAS_LETTER.search(password) or not HAS_DIGIT.search(password):
        raise ValidationError(field, "password must include at least one letter and one number")
    return password


def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def password_matches(user, password):
    """False for anything that isn't the user's password, including a
    password too long for bcrypt or an account whose hash was wiped."""
    if not isinstance(password, str) or len(password.encode()) > MAX_PASSWORD_BYTES:
        return False
    try:
        return bcrypt.checkpw(password.encode(), user.password_hash.encode())
    except ValueError:
        return False


def require_password(user, data):
    """Re-check the password before anything that can't be undone."""
    if not password_matches(user, data.get("password")):
        raise ValidationError("password", "password is incorrect", status=403)
