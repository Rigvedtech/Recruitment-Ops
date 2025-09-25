"""add meetings table

Revision ID: add_meetings_table
Revises: 25e62b9f4491
Create Date: 2025-08-11 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_meetings_table'
down_revision = '25e62b9f4491'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'meetings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.String(length=20), nullable=False),
        sa.Column('candidate_id', sa.String(length=50), nullable=False),
        sa.Column('round_type', sa.String(length=64), nullable=False),
        sa.Column('meet_link', sa.Text(), nullable=False),
        sa.Column('start_time', sa.DateTime(), nullable=True),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('timezone', sa.String(length=64), nullable=False, server_default='UTC'),
        sa.Column('subject', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('request_id', 'candidate_id', 'round_type', name='uq_meeting_request_candidate_round'),
    )

    op.create_index('ix_meetings_request_id', 'meetings', ['request_id'], unique=False)
    op.create_index('ix_meetings_candidate_id', 'meetings', ['candidate_id'], unique=False)
    op.create_index('ix_meetings_round_type', 'meetings', ['round_type'], unique=False)


def downgrade():
    op.drop_index('ix_meetings_round_type', table_name='meetings')
    op.drop_index('ix_meetings_candidate_id', table_name='meetings')
    op.drop_index('ix_meetings_request_id', table_name='meetings')
    op.drop_table('meetings')


