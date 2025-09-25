"""merge workflow progress heads

Revision ID: a7148691d37a
Revises: 412766ecad61, add_meetings_table, add_sla_tables, add_workflow_progress_table_v2, f8e93f24908d
Create Date: 2025-08-24 16:51:01.763987

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7148691d37a'
down_revision = ('412766ecad61', 'add_meetings_table', 'add_sla_tables', 'add_workflow_progress_table_v2', 'f8e93f24908d')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass 