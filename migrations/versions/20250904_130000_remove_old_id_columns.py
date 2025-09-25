"""Remove old ID columns after UUID migration

Revision ID: abc123def456
Revises: 5847853019bf
Create Date: 2025-09-04 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'abc123def456'
down_revision = '5847853019bf'
branch_labels = None
depends_on = None


def upgrade():
    # Remove old ID columns that are no longer needed after UUID migration

    # Drop id_old from users table
    op.drop_column('users', 'id_old')

    # Drop id_old from tracker table
    op.drop_column('tracker', 'id_old')

    # Drop id_old from requirements table
    op.drop_column('requirements', 'id_old')

    # Drop id_old from notifications table
    op.drop_column('notifications', 'id_old')


def downgrade():
    # Add back the old ID columns (for rollback purposes)

    # Add id_old to users table
    op.add_column('users', sa.Column('id_old', sa.Integer(), nullable=True))

    # Add id_old to tracker table
    op.add_column('tracker', sa.Column('id_old', sa.Integer(), nullable=True))

    # Add id_old to requirements table
    op.add_column('requirements', sa.Column('id_old', sa.Integer(), nullable=True))

    # Add id_old to notifications table
    op.add_column('notifications', sa.Column('id_old', sa.Integer(), nullable=True))
