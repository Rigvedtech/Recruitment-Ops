"""Add system settings table

Revision ID: add_system_settings_table
Revises: fb2bd46db530
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_system_settings_table'
down_revision = 'fb2bd46db530'
branch_labels = None
depends_on = None

def upgrade():
    # Create system_settings table
    op.create_table('system_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('setting_key', sa.String(length=100), nullable=False),
        sa.Column('setting_value', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('setting_key')
    )
    
    # Insert initial last refresh time
    op.execute("INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ('last_email_refresh', NOW(), NOW())")

def downgrade():
    op.drop_table('system_settings') 