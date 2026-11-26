"""add user deactivation

Revision ID: d92b6a1f4e7c
Revises: c4e81f2a9b30
Create Date: 2026-11-26 02:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd92b6a1f4e7c'
down_revision = 'c4e81f2a9b30'
branch_labels = None
depends_on = None


# Plain ADD/DROP COLUMN instead of batch mode on purpose. Batch mode rebuilds
# the table on SQLite and would silently lose the lower(email) index, which
# SQLAlchemy can't reflect. SQLite 3.35+ and PostgreSQL both support these directly.


def upgrade():
    # server_default marks every existing user as active, so the NOT NULL
    # column can be added to a table that already has rows.
    op.add_column(
        'users', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true())
    )
    op.add_column('users', sa.Column('deactivated_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('users', 'deactivated_at')
    op.drop_column('users', 'is_active')
