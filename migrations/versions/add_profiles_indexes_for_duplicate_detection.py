"""Add profiles indexes for duplicate detection

Revision ID: add_profiles_indexes_for_duplicate_detection
Revises: fb2bd46db530
Create Date: 2025-07-22 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_profiles_indexes_for_duplicate_detection'
down_revision = 'fb2bd46db530'
branch_labels = None
depends_on = None


def upgrade():
    # Add indexes for better performance on duplicate detection queries
    op.create_index('ix_profiles_contact_no', 'profiles', ['contact_no'], unique=False)
    op.create_index('ix_profiles_email_id', 'profiles', ['email_id'], unique=False)
    op.create_index('ix_profiles_candidate_name', 'profiles', ['candidate_name'], unique=False)
    
    # Add composite index for common duplicate detection queries
    op.create_index('ix_profiles_contact_email', 'profiles', ['contact_no', 'email_id'], unique=False)


def downgrade():
    # Drop the indexes
    op.drop_index('ix_profiles_contact_email', table_name='profiles')
    op.drop_index('ix_profiles_candidate_name', table_name='profiles')
    op.drop_index('ix_profiles_email_id', table_name='profiles')
    op.drop_index('ix_profiles_contact_no', table_name='profiles') 