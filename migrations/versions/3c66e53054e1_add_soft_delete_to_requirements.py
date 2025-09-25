"""add_soft_delete_to_requirements

Revision ID: 3c66e53054e1
Revises: 010902bd4691
Create Date: 2025-09-02 16:05:13.223546

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3c66e53054e1'
down_revision = '010902bd4691'
branch_labels = None
depends_on = None


def upgrade():
    # Add soft delete columns to requirements table
    op.add_column('requirements', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('requirements', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('requirements', sa.Column('deleted_by', sa.String(255), nullable=True))
    
    # Add index for performance on is_deleted column
    op.create_index('ix_requirements_is_deleted', 'requirements', ['is_deleted'])


def downgrade():
    # Remove index
    op.drop_index('ix_requirements_is_deleted', 'requirements')
    
    # Remove soft delete columns
    op.drop_column('requirements', 'deleted_by')
    op.drop_column('requirements', 'deleted_at')
    op.drop_column('requirements', 'is_deleted') 