import uuid

from flask import Blueprint, abort, jsonify
from flask_jwt_extended import (
    create_access_token,
    current_user,
    get_current_user,
    jwt_required,
    verify_jwt_in_request,
)

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app import db
from app.errors import ValidationError
from app.models import Business, User
from app.services.access import require_owner
from app.services.accounts import deactivate_user
from app.services.audit import log_action
from app.services.passwords import hash_password, password_matches, read_new_password
from app.services.validation import json_body, normalize_email, read_email, read_string

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

ALLOWED_ROLES = {"owner", "staff"}
EMAIL_TAKEN = "an account with this email already exists"


def _user_to_dict(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "business_id": user.business_id,
    }


def find_user_by_email(email):
    # lower() matches the unique index, so the lookup and the index agree
    # even for a row saved before emails were normalised.
    return User.query.filter(func.lower(User.email) == normalize_email(email)).first()


def _email_taken():
    return ValidationError("email", EMAIL_TAKEN, status=409)


@auth_bp.post("/register")
def register():
    data = json_body()
    name = read_string(data, "name", 120, required=True)
    email = read_email(data)
    password = read_new_password(data)
    if find_user_by_email(email):
        raise _email_taken()

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

    user = User(
        id=str(uuid.uuid4()),
        business_id=business_id,
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=role,
    )
    db.session.add(user)
    if added_by is not None:
        # Only the role is logged. An email in the audit log would outlive the
        # anonymising that happens when the person is removed.
        log_action(added_by, "user.created", "user", user.id, {"role": role})
    # The business, the user and the audit row are saved in one commit. If two
    # sign-ups with the same email race past the check above, the unique index
    # rejects the second and the rollback leaves no orphan business behind.
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        raise _email_taken() from None
    return jsonify(
        id=user.id, email=user.email, role=user.role, business_id=user.business_id
    ), 201


@auth_bp.post("/login")
def login():
    data = json_body()
    email, password = data.get("email"), data.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        raise ValidationError(None, "email and password are required")
    user = find_user_by_email(email)
    if not user or not user.is_active or not password_matches(user, password):
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
        User.query.filter_by(business_id=current_user.business_id, is_active=True)
        .order_by(User.name)
        .all()
    )
    return jsonify({"users": [_user_to_dict(member) for member in members]}), 200


@auth_bp.delete("/team/<user_id>")
@jwt_required()
def remove_team_member(user_id):
    require_owner(current_user, "only the business owner can remove team members")
    member = db.session.get(User, user_id)
    if member is None or member.business_id != current_user.business_id or not member.is_active:
        abort(404, description="team member not found")
    if member.id == current_user.id:
        abort(400, description="you can't remove yourself here; delete the business instead")
    # Owners can't remove each other, so a co-owner can't lock the other one out.
    if member.role == "owner":
        abort(403, description="only staff members can be removed")

    deactivate_user(member, removed_by=current_user)
    db.session.commit()
    return "", 204
