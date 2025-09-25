"""Add tracker fields to requirements table

Revision ID: add_tracker_fields
Revises: rename_profile_to_requirements
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_tracker_fields'
down_revision = 'rename_profile_to_requirements'
branch_labels = None
depends_on = None

def upgrade():
    # Add new columns to requirements table
    op.add_column('requirements', sa.Column('thread_id', sa.String(length=255), nullable=True))
    
    # Create unique index on request_id
    op.create_index('ix_requirements_request_id', 'requirements', ['request_id'], unique=True)

def downgrade():
    # Remove the index
    op.drop_index('ix_requirements_request_id', table_name='requirements')
    
    # Remove the columns
    op.drop_column('requirements', 'updated_at')
    op.drop_column('requirements', 'notes')
    op.drop_column('requirements', 'assigned_to')
    op.drop_column('requirements', 'status')
    op.drop_column('requirements', 'received_datetime')
    op.drop_column('requirements', 'company_name')
    op.drop_column('requirements', 'sender_name')
    op.drop_column('requirements', 'sender_email')
    op.drop_column('requirements', 'email_subject')
    op.drop_column('requirements', 'request_id')
    op.drop_column('requirements', 'thread_id') 