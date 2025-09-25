"""add is_manual_requirement flag to requirements

Revision ID: add_is_manual_requirement_flag
Revises: add_closed_at_to_requirements
Create Date: 2024-01-15 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_is_manual_requirement_flag'
down_revision = 'add_closed_at_to_requirements'
branch_labels = None
depends_on = None


def upgrade():
    # Add is_manual_requirement column to requirements table
    op.add_column('requirements', sa.Column('is_manual_requirement', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    # Remove is_manual_requirement column from requirements table
    op.drop_column('requirements', 'is_manual_requirement') 