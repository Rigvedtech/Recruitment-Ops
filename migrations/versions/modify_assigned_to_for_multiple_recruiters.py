"""Modify assigned_to field to support multiple recruiters

Revision ID: modify_assigned_to_for_multiple_recruiters
Revises: add_profiles_indexes_for_duplicate_detection
Create Date: 2025-07-22 18:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'modify_assigned_to_for_multiple_recruiters'
down_revision = 'add_profiles_indexes_for_duplicate_detection'
branch_labels = None
depends_on = None


def upgrade():
    # Modify the assigned_to column to support multiple recruiters
    # We'll keep it as TEXT to store comma-separated recruiter usernames
    # This allows for easy querying and doesn't require complex JSON operations
    op.alter_column('requirements', 'assigned_to',
                    existing_type=sa.String(255),
                    type_=sa.Text(),
                    existing_nullable=True)


def downgrade():
    # Revert back to String(255) if needed
    op.alter_column('requirements', 'assigned_to',
                    existing_type=sa.Text(),
                    type_=sa.String(255),
                    existing_nullable=True) 