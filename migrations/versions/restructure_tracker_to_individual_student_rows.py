"""restructure tracker to individual student rows

Revision ID: restructure_tracker_individual
Revises: a6b51be5e505
Create Date: 2025-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'restructure_tracker_individual'
down_revision = 'a6b51be5e505'
branch_labels = None
depends_on = None


def upgrade():
    # Create connection to perform data migration
    connection = op.get_bind()
    
    # Step 1: Get all existing tracker data
    existing_data = connection.execute("""
        SELECT id, request_id, student_ids, extracted_at, email_id, 
               onboarded_student_ids, created_at, updated_at
        FROM tracker
    """).fetchall()
    
    # Step 2: Create new tracker table with individual student rows
    op.create_table('tracker_new',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.String(length=20), nullable=False),
        sa.Column('student_id', sa.String(length=50), nullable=False),
        sa.Column('extracted_at', sa.DateTime(), nullable=True),
        sa.Column('email_id', sa.String(length=255), nullable=True),
        sa.Column('onboarded', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['request_id'], ['requirements.request_id']),
        sa.ForeignKeyConstraint(['student_id'], ['profiles.student_id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('request_id', 'student_id', name='unique_request_student')
    )
    
    # Step 3: Create indexes for better performance
    op.create_index('ix_tracker_new_request_id', 'tracker_new', ['request_id'], unique=False)
    op.create_index('ix_tracker_new_student_id', 'tracker_new', ['student_id'], unique=False)
    op.create_index('ix_tracker_new_onboarded', 'tracker_new', ['onboarded'], unique=False)
    
    # Step 4: Migrate data from comma-separated format to individual rows
    for row in existing_data:
        if row.student_ids:
            # Split comma-separated student IDs
            student_ids_list = [sid.strip() for sid in row.student_ids.split(',') if sid.strip()]
            
            # Parse onboarded student IDs
            onboarded_ids = []
            if row.onboarded_student_ids:
                try:
                    import json
                    onboarded_ids = json.loads(row.onboarded_student_ids)
                except (json.JSONDecodeError, TypeError):
                    onboarded_ids = []
            
            # Insert individual rows for each student
            for student_id in student_ids_list:
                is_onboarded = student_id in onboarded_ids
                connection.execute("""
                    INSERT INTO tracker_new (request_id, student_id, extracted_at, email_id, 
                                           onboarded, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    row.request_id,
                    student_id,
                    row.extracted_at,
                    row.email_id,
                    is_onboarded,
                    row.created_at,
                    row.updated_at
                ))
    
    # Step 5: Drop the old table
    op.drop_table('tracker')
    
    # Step 6: Rename new table to original name
    op.rename_table('tracker_new', 'tracker')
    
    # Step 7: Recreate indexes with original names
    op.create_index('ix_tracker_request_id', 'tracker', ['request_id'], unique=False)
    op.create_index('ix_tracker_student_id', 'tracker', ['student_id'], unique=False)
    op.create_index('ix_tracker_onboarded', 'tracker', ['onboarded'], unique=False)


def downgrade():
    # Create connection to perform data migration
    connection = op.get_bind()
    
    # Step 1: Get all existing individual tracker data grouped by request_id
    existing_data = connection.execute("""
        SELECT request_id, 
               GROUP_CONCAT(student_id) as student_ids,
               GROUP_CONCAT(CASE WHEN onboarded THEN student_id END) as onboarded_student_ids,
               MIN(extracted_at) as extracted_at, 
               MIN(email_id) as email_id,
               MIN(created_at) as created_at, 
               MAX(updated_at) as updated_at
        FROM tracker 
        GROUP BY request_id
    """).fetchall()
    
    # Step 2: Create old tracker table structure
    op.create_table('tracker_old',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.String(length=20), nullable=False),
        sa.Column('student_ids', sa.Text(), nullable=False),
        sa.Column('extracted_at', sa.DateTime(), nullable=True),
        sa.Column('email_id', sa.String(length=255), nullable=True),
        sa.Column('onboarded_student_ids', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['request_id'], ['requirements.request_id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('request_id', name='unique_request_id')
    )
    
    # Step 3: Insert the grouped data back
    for row in existing_data:
        # Convert onboarded student IDs to JSON string
        onboarded_json = None
        if row.onboarded_student_ids:
            try:
                import json
                onboarded_list = [sid.strip() for sid in row.onboarded_student_ids.split(',') if sid.strip()]
                onboarded_json = json.dumps(onboarded_list)
            except Exception:
                onboarded_json = None
        
        connection.execute("""
            INSERT INTO tracker_old (request_id, student_ids, extracted_at, email_id, 
                                   onboarded_student_ids, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            row.request_id,
            row.student_ids,
            row.extracted_at,
            row.email_id,
            onboarded_json,
            row.created_at,
            row.updated_at
        ))
    
    # Step 4: Drop the current table
    op.drop_table('tracker')
    
    # Step 5: Rename old table to original name
    op.rename_table('tracker_old', 'tracker')
