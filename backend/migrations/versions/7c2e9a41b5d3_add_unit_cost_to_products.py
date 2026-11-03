"""add unit_cost to products

Revision ID: 7c2e9a41b5d3
Revises: 43bd508d64a1
Create Date: 2026-11-03 21:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7c2e9a41b5d3'
down_revision = '43bd508d64a1'
branch_labels = None
depends_on = None


def upgrade():
    # server_default fills existing rows with 0, so the NOT NULL column can be
    # added to a table that already has products in it.
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('unit_cost', sa.Integer(), nullable=False, server_default='0')
        )


def downgrade():
    # batch mode lets SQLite drop a column (it rebuilds the table behind the scenes)
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.drop_column('unit_cost')
