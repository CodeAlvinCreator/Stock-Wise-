import re
import uuid

import bcrypt
from flask import Blueprint, abort, jsonify
from flask_jwt_extended import (
    create_access_token,
    current_user,
    get_current_user,
    jwt_required,
    verify_jwt_in_request,
)

from app import db
from app.errors import ValidationError
from app.models import Business, User
from app.services.access import require_owner
from app.services.audit import log_action
from app.services.validation import json_body, read_string

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

ALLOWED_ROLES = {"owner", "staff"}
MIN_PASSWORD_LENGTH = 8
# bcrypt refuses passwords longer than 72 bytes.
MAX_PASSWORD_BYTES = 72
# Not a full RFC check, just enough to catch typos like a missing "@" or domain.
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _user_to_dict(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "business_id": user.business_id,
    }


def _read_password(data):
    password = data.get("password")
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationError(
            "password", f"password must be at least {MIN_PASSWORD_LENGTH} characters"
        )
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        raise ValidationError("password", "password must be at most 72 bytes")
    return password


@auth_bp.post("/register")
def register():
    data = json_body()
    name = read_string(data, "name", 120, required=True)
    email = read_string(data, "email", 255, required=True)
    if not EMAIL_PATTERN.match(email):
        raise ValidationError("email", "email is not a valid address")
    password = _read_password(data)
    if User.query.filter_by(email=email).first():
        abort(409, description="email already used")

    added_by = None
    business_id = data.get("business_id")
    if business_id:
        # Joining an existing business: only a logged-in owner of that
        # business can add people to it and choose their role. The role is
        # checked on the owner's database row, not on the token's claims.
        verify_jwt_in_request(optional=True)
        added_by = get_current_user()
        if added_by is None or added_by.role != "owner" or added_by.business_id != business_id:
            abort(403, description="only an owner of this business can add users")
        role = data.get("role", "staff")
        if role not in ALLOWED_ROLES:
            raise ValidationError("role", f"role must be one of {sorted(ALLOWED_ROLES)}")
    else:
        # Creating a new business: the person who creates it becomes its owner.
        # Any "role" sent by the client is ignored.
        business_name = read_string(data, "business_name", 120)
        if business_name is None:
            raise ValidationError("business_name", "business_id or business_name required")
        business = Business(id=str(uuid.uuid4()), name=business_name)
        db.session.add(business)
        business_id = business.id
        role = "owner"

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = User(
        id=str(uuid.uuid4()),
        business_id=business_id,
        name=name,
        email=email,
        password_hash=hashed,
        role=role,
    )
    db.session.add(user)
    if added_by is not None:
        log_action(added_by, "user.created", "user", user.id, {"email": email, "role": role})
    db.session.commit()
    return jsonify(
        id=user.id, email=user.email, role=user.role, business_id=user.business_id
    ), 201


@auth_bp.post("/login")
def login():
    data = json_body()
    email, password = data.get("email"), data.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        raise ValidationError(None, "email and password are required")
    user = User.query.filter_by(email=email.strip()).first()
    if (
        not user
        or len(password.encode()) > MAX_PASSWORD_BYTES
        or not bcrypt.checkpw(password.encode(), user.password_hash.encode())
    ):
        abort(401, description="wrong email or password")
    token = create_access_token(
        identity=user.id,
        additional_claims={"role": user.role, "business_id": user.business_id},
    )
    return jsonify(access_token=token), 200


@auth_bp.get("/team")
@jwt_required()
def list_team():
    require_owner(current_user, "only the business owner can view the team")
    members = (
        User.query.filter_by(business_id=current_user.business_id).order_by(User.name).all()
    )
    return jsonify({"users": [_user_to_dict(member) for member in members]}), 200
