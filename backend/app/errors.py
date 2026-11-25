import logging

from flask import jsonify
from werkzeug.exceptions import HTTPException

from app import db, jwt
from app.models import User

logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Bad input from the client. Becomes a 400 that names the field, so the
    frontend can show the message next to the right input."""

    def __init__(self, field, message):
        super().__init__(message)
        self.field = field
        self.message = message


def _error(message, status):
    return jsonify(error=message), status


def register_error_handlers(app):
    @app.errorhandler(ValidationError)
    def handle_validation_error(error):
        return jsonify(error=error.message, field=error.field), 400

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        # Keep our own messages ("product not found"), but swap werkzeug's long
        # default sentences for the short name, e.g. "not found".
        default = error.description == type(error).description
        return _error(error.name.lower() if default else error.description, error.code)

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        # The traceback goes to the server log only. The client gets a plain
        # message, so database errors and file paths never leak out.
        logger.exception("Unhandled error")
        db.session.rollback()
        return _error("something went wrong on the server", 500)


@jwt.user_lookup_loader
def load_user(_jwt_header, jwt_data):
    return db.session.get(User, jwt_data["sub"])


@jwt.user_lookup_error_loader
def user_not_found(_jwt_header, _jwt_data):
    return _error("user not found", 401)


@jwt.unauthorized_loader
def missing_token(_reason):
    return _error("login required", 401)


@jwt.expired_token_loader
def expired_token(_jwt_header, _jwt_data):
    return _error("your session has expired, please log in again", 401)


@jwt.invalid_token_loader
def invalid_token(_reason):
    return _error("invalid login token", 401)


@jwt.revoked_token_loader
def revoked_token(_jwt_header, _jwt_data):
    return _error("invalid login token", 401)
