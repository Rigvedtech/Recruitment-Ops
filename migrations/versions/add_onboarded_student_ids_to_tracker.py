"""add onboarded student ids to tracker

Revision ID: add_onboarded_student_ids
Revises: fb2bd46db530
Create Date: 2024-01-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_onboarded_student_ids'
down_revision = 'fb2bd46db530'
branch_labels = None
depends_on = None


def upgrade():
    # Add onboarded_student_ids column to tracker table
    op.add_column('tracker', sa.Column('onboarded_student_ids', sa.Text(), nullable=True))


def downgrade():
    # Remove onboarded_student_ids column from tracker table
    op.drop_column('tracker', 'onboarded_student_ids') 