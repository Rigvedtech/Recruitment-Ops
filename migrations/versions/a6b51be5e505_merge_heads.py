"""merge heads

Revision ID: a6b51be5e505
Revises: add_is_manual_requirement_flag, add_system_settings_table, modify_assigned_to_for_multiple_recruiters
Create Date: 2025-08-08 11:50:08.218039

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a6b51be5e505'
down_revision = ('add_is_manual_requirement_flag', 'add_system_settings_table', 'modify_assigned_to_for_multiple_recruiters')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass 