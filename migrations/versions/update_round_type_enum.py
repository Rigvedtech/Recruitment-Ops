"""Update RoundTypeEnum to include new values

Revision ID: update_round_type_enum
Revises: 
Create Date: 2025-09-17 18:25:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'update_round_type_enum'
down_revision = None  # Set this to the latest revision ID if needed
branch_labels = None
depends_on = None

def upgrade():
    """Add new enum values to RoundTypeEnum"""
    
    # Add new enum values to the existing enum type
    op.execute("ALTER TYPE roundtypeenum ADD VALUE IF NOT EXISTS 'interview_round_1'")
    op.execute("ALTER TYPE roundtypeenum ADD VALUE IF NOT EXISTS 'interview_round_2'")

def downgrade():
    """Remove new enum values (note: PostgreSQL doesn't support removing enum values easily)"""
    # PostgreSQL doesn't support removing enum values directly
    # This would require recreating the enum type and updating all references
    # For now, we'll leave the values in place for backward compatibility
    pass
