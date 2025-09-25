"""rename profile to requirements

Revision ID: rename_profile_to_requirements
Revises: 
Create Date: 2024-01-08 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = 'rename_profile_to_requirements'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Check if requirements table exists, create if not
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    table_names = inspector.get_table_names()
    
    if 'requirements' not in table_names:
        # Create new requirements table
        op.create_table('requirements',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('job_title', sa.String(255), nullable=True),
            sa.Column('department', sa.String(255), nullable=True),
            sa.Column('location', sa.String(255), nullable=True),
            sa.Column('shift', sa.String(50), nullable=True),
            sa.Column('job_type', sa.String(50), nullable=True),
            sa.Column('hiring_manager', sa.String(255), nullable=True),
            sa.Column('experience_range', sa.String(50), nullable=True),
            sa.Column('skills_required', sa.Text, nullable=True),
            sa.Column('minimum_qualification', sa.String(255), nullable=True),
            sa.Column('number_of_positions', sa.Integer, nullable=True),
            sa.Column('budget_ctc', sa.String(100), nullable=True),
            sa.Column('priority', sa.String(50), nullable=True),
            sa.Column('tentative_doj', sa.Date, nullable=True),
            sa.Column('additional_remarks', sa.Text, nullable=True),
            sa.Column('email_id', sa.String(255), nullable=True),
            sa.Column('created_at', sa.DateTime, default=datetime.utcnow),
            sa.PrimaryKeyConstraint('id')
        )
    
    # Drop the existing profile table if it exists
    if 'profile' in table_names:
        op.drop_table('profile')

def downgrade():
    # Drop the requirements table
    op.drop_table('requirements')
    
    # Recreate the original profile table
    op.create_table('profile',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('candidate_name', sa.String(255), nullable=True),
        sa.Column('total_exp', sa.String(50), nullable=True),
        sa.Column('relevant_exp', sa.String(50), nullable=True),
        sa.Column('current_company', sa.String(255), nullable=True),
        sa.Column('current_ctc', sa.String(50), nullable=True),
        sa.Column('expected_ctc', sa.String(50), nullable=True),
        sa.Column('notice_period', sa.String(50), nullable=True),
        sa.Column('location', sa.String(255), nullable=True),
        sa.Column('education', sa.String(255), nullable=True),
        sa.Column('key_skills', sa.Text, nullable=True),
        sa.Column('source', sa.String(255), nullable=True),
        sa.Column('email_id', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime, default=datetime.utcnow),
        sa.PrimaryKeyConstraint('id')
    ) 