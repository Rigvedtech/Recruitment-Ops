"""merge_heads

Revision ID: 412766ecad61
Revises: add_onboarded_student_ids, restructure_tracker_individual
Create Date: 2025-08-08 12:42:37.358185

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '412766ecad61'
down_revision = ('add_onboarded_student_ids', 'restructure_tracker_individual')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass 