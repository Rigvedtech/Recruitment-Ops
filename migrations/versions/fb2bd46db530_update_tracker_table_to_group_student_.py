"""Update tracker table to group student IDs

Revision ID: fb2bd46db530
Revises: 25e62b9f4491
Create Date: 2025-07-10 17:29:57.709413

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fb2bd46db530'
down_revision = '25e62b9f4491'
branch_labels = None
depends_on = None


def upgrade():
    # Create connection to perform data migration
    connection = op.get_bind()
    
    # Step 1: Get all existing tracker data grouped by request_id
    existing_data = connection.execute("""
        SELECT request_id, GROUP_CONCAT(student_id) as student_ids, 
               MIN(extracted_at) as extracted_at, MIN(email_id) as email_id,
               MIN(created_at) as created_at, MAX(updated_at) as updated_at
        FROM tracker 
        GROUP BY request_id
    """).fetchall()
    
    # Step 2: Drop the old table
    op.drop_table('tracker')
    
    # Step 3: Create new table with grouped structure
    op.create_table('tracker',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.String(length=20), nullable=False),
        sa.Column('student_ids', sa.Text(), nullable=False),
        sa.Column('extracted_at', sa.DateTime(), nullable=True),
        sa.Column('email_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['request_id'], ['requirements.request_id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('request_id', name='unique_request_id')
    )
    
    # Step 4: Insert the grouped data
    for row in existing_data:
        connection.execute("""
            INSERT INTO tracker (request_id, student_ids, extracted_at, email_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            row.request_id,
            row.student_ids,
            row.extracted_at,
            row.email_id,
            row.created_at,
            row.updated_at
        ))


def downgrade():
    # Create connection to perform data migration
    connection = op.get_bind()
    
    # Step 1: Get all existing grouped data
    existing_data = connection.execute("""
        SELECT request_id, student_ids, extracted_at, email_id, created_at, updated_at
        FROM tracker
    """).fetchall()
    
    # Step 2: Drop the current table
    op.drop_table('tracker')
    
    # Step 3: Create old table structure
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
    
    # Step 4: Insert the ungrouped data (split student_ids back to individual rows)
    for row in existing_data:
        if row.student_ids:
            student_ids_list = [sid.strip() for sid in row.student_ids.split(',') if sid.strip()]
            for student_id in student_ids_list:
                connection.execute("""
                    INSERT INTO tracker (request_id, student_id, extracted_at, email_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    row.request_id,
                    student_id,
                    row.extracted_at,
                    row.email_id,
                    row.created_at,
                    row.updated_at
                )) 