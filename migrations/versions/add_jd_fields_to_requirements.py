"""add jd fields to requirements

Revision ID: add_jd_fields_to_requirements
Revises: add_is_manual_requirement_flag
Create Date: 2024-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_jd_fields_to_requirements'
down_revision = 'add_is_manual_requirement_flag'
branch_labels = None
depends_on = None


def upgrade():
    # Add JD fields to requirements table
    op.add_column('requirements', sa.Column('job_description', sa.Text(), nullable=True))
    op.add_column('requirements', sa.Column('jd_path', sa.String(500), nullable=True))
    op.add_column('requirements', sa.Column('job_file_name', sa.String(255), nullable=True))


def downgrade():
    # Remove JD fields from requirements table
    op.drop_column('requirements', 'job_file_name')
    op.drop_column('requirements', 'jd_path')
    op.drop_column('requirements', 'job_description')
