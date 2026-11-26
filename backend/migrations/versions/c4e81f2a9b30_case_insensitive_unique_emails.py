"""case-insensitive unique emails

Revision ID: c4e81f2a9b30
Revises: 3a4ab5082b0d
Create Date: 2026-11-26 01:20:00.000000

Before this, "Favour@shop.rw" and "favour@shop.rw" could register as two
accounts. This migration cleans up the duplicates already in the database,
then adds a unique index on lower(email) so it can't happen again.

For each group of emails that only differ by case or surrounding spaces:
- the oldest account keeps the email, trimmed and lowercased
- every newer account gets a marked, non-routable address,
  dup-<user id>+<original email with @ as .at.>@stockwise.invalid
No user, business or other row is deleted, and nothing else changes.

Downgrade drops the index but does not restore the renamed emails.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e81f2a9b30'
down_revision = '3a4ab5082b0d'
branch_labels = None
depends_on = None

# .invalid is reserved (RFC 2606), so mail to these addresses can never be delivered.
DUPLICATE_DOMAIN = '@stockwise.invalid'
MAX_EMAIL_LENGTH = 255

users = sa.table(
    'users',
    sa.column('id', sa.String),
    sa.column('email', sa.String),
    sa.column('created_at', sa.DateTime),
)


def _duplicate_address(user_id, email):
    prefix = f'dup-{user_id}+'
    original = email.replace('@', '.at.')
    room = MAX_EMAIL_LENGTH - len(prefix) - len(DUPLICATE_DOMAIN)
    return prefix + original[:room] + DUPLICATE_DOMAIN


def _email_changes(rows):
    """Return (renames, normalisations) as lists of (user id, new email).

    Renames have to run first: until a newer duplicate is renamed, giving the
    oldest account its lowercased email could clash with that duplicate's
    exact email under the existing unique constraint.
    """
    groups = {}
    for user_id, email, created_at in rows:
        groups.setdefault(email.strip().lower(), []).append((user_id, email, created_at))

    renames, normalisations = [], []
    for normalised, members in groups.items():
        # Oldest first. A missing created_at sorts last, so a dated account wins.
        members.sort(key=lambda m: (m[2] is None, m[2] or 0, m[0]))
        keeper_id, keeper_email, _ = members[0]
        if keeper_email != normalised:
            normalisations.append((keeper_id, normalised))
        for user_id, email, _ in members[1:]:
            renames.append((user_id, _duplicate_address(user_id, normalised)))
    return renames, normalisations


def upgrade():
    connection = op.get_bind()
    rows = connection.execute(sa.select(users.c.id, users.c.email, users.c.created_at)).fetchall()
    renames, normalisations = _email_changes(rows)
    for user_id, email in renames + normalisations:
        connection.execute(users.update().where(users.c.id == user_id).values(email=email))

    op.create_index('uq_users_email_lower', 'users', [sa.text('lower(email)')], unique=True)


def downgrade():
    op.drop_index('uq_users_email_lower', table_name='users')
