import uuid

import bcrypt
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt, verify_jwt_in_request

from app import db
from app.models import Business, User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

ALLOWED_ROLES = {"owner", "staff"}


@auth_bp.post("/register")
def register():
    data = request.get_json() or {}
    email, password, name = data.get("email"), data.get("password"), data.get("name")
    if not email or not password or not name:
        return jsonify(error="name, email and password required"), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="email already used"), 409

    business_id = data.get("business_id")
    if business_id:
        # Joining an existing business: only a logged-in owner of that
        # business can add people to it and choose their role.
        verify_jwt_in_request(optional=True)
        claims = get_jwt()
        if claims.get("role") != "owner" or claims.get("business_id") != business_id:
            return jsonify(error="only an owner of this business can add users"), 403
        role = data.get("role", "staff")
        if role not in ALLOWED_ROLES:
            return jsonify(error=f"role must be one of {sorted(ALLOWED_ROLES)}"), 400
    else:
        # Creating a new business: the person who creates it becomes its owner.
        # Any "role" sent by the client is ignored.
        business_name = data.get("business_name")
        if not business_name:
            return jsonify(error="business_id or business_name required"), 400
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
    db.session.commit()
    return jsonify(
        id=user.id, email=user.email, role=user.role, business_id=user.business_id
    ), 201


@auth_bp.post("/login")
def login():
    data = request.get_json() or {}
    user = User.query.filter_by(email=data.get("email")).first()
    if not user or not bcrypt.checkpw(
        data.get("password", "").encode(), user.password_hash.encode()
    ):
        return jsonify(error="wrong email or password"), 401
    token = create_access_token(
        identity=user.id,
        additional_claims={"role": user.role, "business_id": user.business_id},
    )
    return jsonify(access_token=token), 200
