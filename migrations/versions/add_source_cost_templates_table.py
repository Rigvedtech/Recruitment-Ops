"""Add source cost templates table

Revision ID: add_source_cost_templates
Revises: 
Create Date: 2025-11-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_source_cost_templates'
down_revision = None  # Will be automatically set by Alembic
branch_labels = None
depends_on = None

def upgrade():
    # Create source_cost_templates table
    op.create_table('source_cost_templates',
        sa.Column('template_id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('source', sa.Enum('naukri_com', 'monster_india', 'timesjobs', 'shine_com', 'freshersworld', 
                                     'github_stackoverflow', 'internshala', 'LinkedIn', 'referral', 
                                     name='sourceenum'), nullable=False),
        sa.Column('cost', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.0'),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('template_id'),
        sa.UniqueConstraint('source'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.user_id'], )
    )
    
    # Insert default values for all source types
    op.execute("""
        INSERT INTO source_cost_templates (source, cost) VALUES
        ('naukri_com', 0.0),
        ('monster_india', 0.0),
        ('timesjobs', 0.0),
        ('shine_com', 0.0),
        ('freshersworld', 0.0),
        ('github_stackoverflow', 0.0),
        ('internshala', 0.0),
        ('LinkedIn', 0.0),
        ('referral', 0.0)
        ON CONFLICT (source) DO NOTHING
    """)

def downgrade():
    op.drop_table('source_cost_templates')

