"""Add NOT NULL constraints to critical fields

Revision ID: add_nullable_fix
Revises: dd6f98d38504
Create Date: 2025-01-08 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_nullable_fix'
down_revision = 'dd6f98d38504'
branch_labels = None
depends_on = None


def upgrade():
    """Add NOT NULL constraints to critical fields"""

    # Requirements table - make critical fields NOT NULL
    with op.batch_alter_table('requirements', schema=None) as batch_op:
        # First, handle any NULL values by setting defaults
        batch_op.execute("UPDATE requirements SET status = 'Open' WHERE status IS NULL")
        batch_op.execute("UPDATE requirements SET request_id = 'TEMP_' || id WHERE request_id IS NULL")

        # Add NOT NULL constraints
        batch_op.alter_column('request_id', nullable=False)
        batch_op.alter_column('status', nullable=False)

    # Profiles table - make critical fields NOT NULL
    with op.batch_alter_table('profiles', schema=None) as batch_op:
        # Handle any NULL values
        batch_op.execute("UPDATE profiles SET candidate_name = 'Unknown' WHERE candidate_name IS NULL")
        batch_op.execute("UPDATE profiles SET student_id = 'TEMP_' || id WHERE student_id IS NULL")

        # Add NOT NULL constraints
        batch_op.alter_column('student_id', nullable=False)
        batch_op.alter_column('candidate_name', nullable=False)

    # Users table - make critical fields NOT NULL
    with op.batch_alter_table('users', schema=None) as batch_op:
        # Handle any NULL values
        batch_op.execute("UPDATE users SET role = 'recruiter' WHERE role IS NULL")
        batch_op.execute("UPDATE users SET username = 'temp_' || id WHERE username IS NULL")

        # Add NOT NULL constraints
        batch_op.alter_column('username', nullable=False)
        batch_op.alter_column('role', nullable=False)


def downgrade():
    """Remove NOT NULL constraints"""

    # Requirements table
    with op.batch_alter_table('requirements', schema=None) as batch_op:
        batch_op.alter_column('request_id', nullable=True)
        batch_op.alter_column('status', nullable=True)

    # Profiles table
    with op.batch_alter_table('profiles', schema=None) as batch_op:
        batch_op.alter_column('student_id', nullable=True)
        batch_op.alter_column('candidate_name', nullable=True)

    # Users table
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('username', nullable=True)
        batch_op.alter_column('role', nullable=True)
