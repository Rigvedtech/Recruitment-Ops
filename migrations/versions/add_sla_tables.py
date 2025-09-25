"""Add SLA tracking tables

Revision ID: add_sla_tables
Revises: f8e93f24908d
Create Date: 2024-01-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_sla_tables'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Create sla_config table
    op.create_table('sla_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('step_name', sa.String(length=100), nullable=False),
        sa.Column('step_display_name', sa.String(length=100), nullable=False),
        sa.Column('sla_hours', sa.Integer(), nullable=False),
        sa.Column('sla_days', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('step_name')
    )
    
    # Create sla_tracker table
    op.create_table('sla_tracker',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.String(length=20), nullable=False),
        sa.Column('step_name', sa.String(length=100), nullable=False),
        sa.Column('step_display_name', sa.String(length=100), nullable=False),
        sa.Column('step_started_at', sa.DateTime(), nullable=False),
        sa.Column('step_completed_at', sa.DateTime(), nullable=True),
        sa.Column('sla_hours', sa.Integer(), nullable=False),
        sa.Column('sla_days', sa.Integer(), nullable=False),
        sa.Column('actual_duration_hours', sa.Float(), nullable=True),
        sa.Column('actual_duration_days', sa.Float(), nullable=True),
        sa.Column('sla_status', sa.String(length=20), nullable=True),
        sa.Column('sla_breach_hours', sa.Float(), nullable=True),
        sa.Column('assigned_recruiter', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['request_id'], ['requirements.request_id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for better performance
    op.create_index(op.f('ix_sla_tracker_request_id'), 'sla_tracker', ['request_id'], unique=False)
    op.create_index(op.f('ix_sla_tracker_step_name'), 'sla_tracker', ['step_name'], unique=False)
    op.create_index(op.f('ix_sla_tracker_sla_status'), 'sla_tracker', ['sla_status'], unique=False)
    op.create_index(op.f('ix_sla_tracker_step_completed_at'), 'sla_tracker', ['step_completed_at'], unique=False)


def downgrade():
    # Drop indexes
    op.drop_index(op.f('ix_sla_tracker_step_completed_at'), table_name='sla_tracker')
    op.drop_index(op.f('ix_sla_tracker_sla_status'), table_name='sla_tracker')
    op.drop_index(op.f('ix_sla_tracker_step_name'), table_name='sla_tracker')
    op.drop_index(op.f('ix_sla_tracker_request_id'), table_name='sla_tracker')
    
    # Drop tables
    op.drop_table('sla_tracker')
    op.drop_table('sla_config')
