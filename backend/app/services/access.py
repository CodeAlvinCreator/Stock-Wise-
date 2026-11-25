from flask import abort


def require_owner(user, message):
    # The role comes from the database row, not the token, so a demoted user
    # loses access straight away instead of when their token expires.
    if user.role != "owner":
        abort(403, description=message)
