"""Merge heads before UUID migration

Revision ID: 5847853019bf
Revises: b9704b3a6f93, uuid_primary_keys
Create Date: 2025-09-03 18:17:07.132890

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5847853019bf'
down_revision = ('b9704b3a6f93', 'uuid_primary_keys')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass 