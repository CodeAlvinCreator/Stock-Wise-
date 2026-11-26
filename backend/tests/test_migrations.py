import pytest
from flask_migrate import downgrade, upgrade
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app import create_app, db
from tests.conftest import TestConfig

BEFORE_EMAIL_FIX = "3a4ab5082b0d"


@pytest.fixture
def migrated_app(tmp_path):
    """A real SQLite file built by the migrations, not by create_all."""

    class FileConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp_path / 'migrations.db'}"

    app = create_app(FileConfig)
    with app.app_context():
        upgrade(revision=BEFORE_EMAIL_FIX)
        yield app
        db.session.remove()
        db.engine.dispose()


def _add_user(user_id, email, created_at):
    db.session.execute(
        text(
            "INSERT INTO users (id, business_id, name, email, password_hash, role, created_at) "
            "VALUES (:id, 'b-1', 'Name', :email, 'x', 'owner', :created_at)"
        ),
        {"id": user_id, "email": email, "created_at": created_at},
    )


def _emails():
    rows = db.session.execute(text("SELECT id, email FROM users")).fetchall()
    return dict(rows)


def test_duplicates_are_renamed_and_the_oldest_keeps_the_email(migrated_app):
    db.session.execute(text("INSERT INTO businesses (id, name) VALUES ('b-1', 'Shop')"))
    _add_user("u-old", "Favour@Shop.rw", "2026-11-01 09:00:00")
    _add_user("u-new", "favour@shop.rw", "2026-11-20 09:00:00")
    _add_user("u-spaces", " FAVOUR@SHOP.RW ", "2026-11-21 09:00:00")
    _add_user("u-other", "Peace@Shop.rw", "2026-11-02 09:00:00")
    db.session.commit()

    upgrade()

    emails = _emails()
    assert emails["u-old"] == "favour@shop.rw"
    assert emails["u-new"] == "dup-u-new+favour.at.shop.rw@stockwise.invalid"
    assert emails["u-spaces"] == "dup-u-spaces+favour.at.shop.rw@stockwise.invalid"
    assert emails["u-other"] == "peace@shop.rw"
    # Nothing was deleted.
    assert db.session.execute(text("SELECT COUNT(*) FROM users")).scalar() == 4
    assert db.session.execute(text("SELECT COUNT(*) FROM businesses")).scalar() == 1


def test_index_rejects_a_case_variant_after_upgrade(migrated_app):
    db.session.execute(text("INSERT INTO businesses (id, name) VALUES ('b-1', 'Shop')"))
    db.session.commit()
    upgrade()

    _add_user("u-1", "favour@shop.rw", "2026-11-01 09:00:00")
    db.session.commit()
    with pytest.raises(IntegrityError):
        _add_user("u-2", "FAVOUR@shop.rw", "2026-11-02 09:00:00")
        db.session.commit()
    db.session.rollback()


def test_existing_users_become_active(migrated_app):
    db.session.execute(text("INSERT INTO businesses (id, name) VALUES ('b-1', 'Shop')"))
    _add_user("u-1", "favour@shop.rw", "2026-11-01 09:00:00")
    db.session.commit()

    upgrade()

    assert db.session.execute(text("SELECT is_active FROM users")).scalar() == 1
    assert _sqlite_has_index("uq_users_email_lower")


def test_downgrade_runs_cleanly(migrated_app):
    upgrade()
    downgrade(revision=BEFORE_EMAIL_FIX)
    assert "is_active" not in {c["name"] for c in inspect(db.engine).get_columns("users")}
    assert not _sqlite_has_index("uq_users_email_lower")


def _sqlite_has_index(name):
    # SQLAlchemy skips expression indexes when it reflects SQLite, so ask SQLite directly.
    query = text("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = :name")
    return db.session.execute(query, {"name": name}).scalar() == 1
