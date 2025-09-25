"""Add workflow progress table

Revision ID: add_workflow_progress_table
Revises: add_sla_tables
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = 'add_workflow_progress_table_v2'
down_revision = '639219c27bd3'
branch_labels = None
depends_on = None


def upgrade():
    # Create workflow_progress table
    op.create_table('workflow_progress',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.String(length=20), nullable=False),
        sa.Column('screening_selected', sa.Text(), nullable=True, default='[]'),
        sa.Column('screening_rejected', sa.Text(), nullable=True, default='[]'),
        sa.Column('interview_scheduled', sa.Text(), nullable=True, default='[]'),
        sa.Column('interview_rescheduled', sa.Text(), nullable=True, default='[]'),
        sa.Column('round1_selected', sa.Text(), nullable=True, default='[]'),
        sa.Column('round1_rejected', sa.Text(), nullable=True, default='[]'),
        sa.Column('round1_rescheduled', sa.Text(), nullable=True, default='[]'),
        sa.Column('round2_selected', sa.Text(), nullable=True, default='[]'),
        sa.Column('round2_rejected', sa.Text(), nullable=True, default='[]'),
        sa.Column('round2_rescheduled', sa.Text(), nullable=True, default='[]'),
        sa.Column('offered', sa.Text(), nullable=True, default='[]'),
        sa.Column('onboarding', sa.Text(), nullable=True, default='[]'),
        sa.Column('current_step', sa.String(length=50), nullable=True, default='candidate_submission'),
        sa.Column('newly_added_profiles', sa.Text(), nullable=True, default='[]'),
        sa.Column('session_start_time', sa.BigInteger(), nullable=True, default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['request_id'], ['requirements.request_id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('request_id')
    )


def downgrade():
    # Drop workflow_progress table
    op.drop_table('workflow_progress')
