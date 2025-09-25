"""add closed_at to requirements

Revision ID: add_closed_at_to_requirements
Revises: fb2bd46db530
Create Date: 2024-01-15 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_closed_at_to_requirements'
down_revision = 'fb2bd46db530'
branch_labels = None
depends_on = None


def upgrade():
    # Add closed_at column to requirements table
    op.add_column('requirements', sa.Column('closed_at', sa.DateTime(), nullable=True))


def downgrade():
    # Remove closed_at column from requirements table
    op.drop_column('requirements', 'closed_at') 