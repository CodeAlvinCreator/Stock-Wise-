from flask import Blueprint, abort, jsonify
from flask_jwt_extended import current_user, jwt_required

from app import db
from app.errors import ValidationError
from app.models import Business
from app.services.access import require_owner
from app.services.accounts import deactivate_user, delete_business
from app.services.passwords import require_password
from app.services.validation import json_body, read_string

account_bp = Blueprint("account", __name__, url_prefix="/api/account")


@account_bp.get("")
@jwt_required()
def get_account():
    business = db.session.get(Business, current_user.business_id)
    return jsonify(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        role=current_user.role,
        business_id=business.id,
        business_name=business.name,
    ), 200


@account_bp.delete("")
@jwt_required()
def delete_own_account():
    # An owner's account holds the business together, so owners close the
    # whole business instead (DELETE /api/account/business).
    if current_user.role == "owner":
        abort(403, description="owners delete the whole business account instead")
    require_password(current_user, json_body())

    deactivate_user(current_user, removed_by=current_user)
    db.session.commit()
    return "", 204


@account_bp.delete("/business")
@jwt_required()
def delete_own_business():
    require_owner(current_user, "only the business owner can delete the business")
    data = json_body()
    require_password(current_user, data)
    business = db.session.get(Business, current_user.business_id)
    if read_string(data, "business_name", 120, required=True) != business.name.strip():
        raise ValidationError("business_name", "type the business name exactly as it is shown")

    delete_business(business.id)
    db.session.commit()
    return "", 204
