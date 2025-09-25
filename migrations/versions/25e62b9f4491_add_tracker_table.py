"""Add tracker table

Revision ID: 25e62b9f4491
Revises: add_tracker_fields
Create Date: 2025-07-10 17:04:17.137333

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '25e62b9f4491'
down_revision = 'add_tracker_fields'
branch_labels = None
depends_on = None


def upgrade():
    # Create tracker table
    op.create_table('tracker',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.String(length=20), nullable=False),
        sa.Column('student_id', sa.String(length=50), nullable=False),
        sa.Column('extracted_at', sa.DateTime(), nullable=True),
        sa.Column('email_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['request_id'], ['requirements.request_id']),
        sa.ForeignKeyConstraint(['student_id'], ['profiles.student_id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('request_id', 'student_id', name='unique_request_student')
    )
    
    # Create indexes for better performance
    op.create_index('ix_tracker_request_id', 'tracker', ['request_id'], unique=False)
    op.create_index('ix_tracker_student_id', 'tracker', ['student_id'], unique=False)


def downgrade():
    # Drop indexes
    op.drop_index('ix_tracker_student_id', table_name='tracker')
    op.drop_index('ix_tracker_request_id', table_name='tracker')
    
    # Drop the tracker table
    op.drop_table('tracker') 