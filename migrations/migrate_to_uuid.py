#!/usr/bin/env python3
"""
UUID Migration Script
Converts all primary keys from integers/strings to UUIDs while preserving relationships
"""

import os
import sys
import uuid
from datetime import datetime
from typing import Dict, List, Any
import json

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db
from sqlalchemy import text, MetaData, Table
from sqlalchemy.exc import SQLAlchemyError

class UUIDMigration:
    def __init__(self):
        # Disable scheduler during migration
        os.environ['DISABLE_SCHEDULER'] = 'true'
        self.app = create_app()
        self.app.app_context().push()
        self.id_mappings = {}
        self.migration_log = []
        
    def log(self, message: str, level: str = 'INFO'):
        """Log migration messages"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"[{timestamp}] [{level}] {message}"
        print(log_entry)
        self.migration_log.append(log_entry)
        
    def save_mappings(self):
        """Save ID mappings to file for reference"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        mapping_file = f'migrations/uuid_mappings_{timestamp}.json'
        
        with open(mapping_file, 'w', encoding='utf-8') as f:
            # Convert UUID objects to strings for JSON serialization
            serializable_mappings = {}
            for table, mappings in self.id_mappings.items():
                serializable_mappings[table] = {
                    str(old_id): str(new_id) 
                    for old_id, new_id in mappings.items()
                }
            
            json.dump({
                'timestamp': timestamp,
                'mappings': serializable_mappings,
                'log': self.migration_log
            }, f, indent=2)
        
        self.log(f"Mappings saved to {mapping_file}")
        return mapping_file
    
    def backup_database(self):
        """Create a backup before migration"""
        self.log("Creating database backup before migration...")
        
        from migrations.backup_and_restore import DatabaseBackup
        backup = DatabaseBackup()
        backup_file = backup.backup_to_json()
        
        self.log(f"Backup created: {backup_file}")
        return backup_file
    
    def create_uuid_columns(self):
        """Step 1: Add UUID columns to all tables"""
        self.log("=" * 60)
        self.log("STEP 1: Adding UUID columns to all tables")
        self.log("=" * 60)
        
        with db.engine.begin() as conn:
            # Add UUID columns to all tables
            tables_to_migrate = [
                ('users', 'id', 'integer'),
                ('profiles', 'student_id', 'string'),
                ('requirements', 'id', 'integer'),
                ('tracker', 'id', 'integer'),
                ('status_tracker', 'id', 'integer'),
                ('sla_tracker', 'id', 'integer'),
                ('sla_config', 'id', 'integer'),
                ('meetings', 'id', 'integer'),
                ('notifications', 'id', 'integer'),
                ('workflow_progress', 'id', 'integer'),
                ('system_settings', 'id', 'integer')
            ]
            
            for table_name, old_pk_column, pk_type in tables_to_migrate:
                try:
                    # Check if table exists
                    result = conn.execute(text(f"""
                        SELECT COUNT(*) FROM information_schema.tables 
                        WHERE table_name = '{table_name}'
                    """))
                    
                    if result.scalar() == 0:
                        self.log(f"Table {table_name} does not exist, skipping", "WARNING")
                        continue
                    
                    # Add new_uuid column if it doesn't exist
                    conn.execute(text(f"""
                        ALTER TABLE {table_name} 
                        ADD COLUMN IF NOT EXISTS new_uuid VARCHAR(36)
                    """))
                    
                    self.log(f"✓ Added UUID column to {table_name}")
                    
                except Exception as e:
                    self.log(f"✗ Error adding UUID column to {table_name}: {str(e)}", "ERROR")
    
    def generate_uuids(self):
        """Step 2: Generate UUIDs for all existing records"""
        self.log("=" * 60)
        self.log("STEP 2: Generating UUIDs for existing records")
        self.log("=" * 60)
        
        with db.engine.begin() as conn:
            tables = [
                'users', 'profiles', 'requirements', 'tracker', 
                'status_tracker', 'sla_tracker', 'sla_config',
                'meetings', 'notifications', 'workflow_progress', 
                'system_settings'
            ]
            
            for table_name in tables:
                try:
                    # Check if table exists
                    result = conn.execute(text(f"""
                        SELECT COUNT(*) FROM information_schema.tables 
                        WHERE table_name = '{table_name}'
                    """))
                    
                    if result.scalar() == 0:
                        continue
                    
                    # Get the primary key column name
                    if table_name == 'profiles':
                        pk_column = 'student_id'
                    else:
                        pk_column = 'id'
                    
                    # Fetch all records
                    result = conn.execute(text(f"SELECT {pk_column} FROM {table_name}"))
                    records = result.fetchall()
                    
                    # Generate and store UUIDs
                    self.id_mappings[table_name] = {}
                    
                    for record in records:
                        old_id = record[0]
                        new_uuid = str(uuid.uuid4())
                        
                        # Update record with new UUID
                        conn.execute(text(f"""
                            UPDATE {table_name} 
                            SET new_uuid = :new_uuid 
                            WHERE {pk_column} = :old_id
                        """), {'new_uuid': new_uuid, 'old_id': old_id})
                        
                        # Store mapping
                        self.id_mappings[table_name][str(old_id)] = new_uuid
                    
                    self.log(f"✓ Generated {len(records)} UUIDs for {table_name}")
                    
                except Exception as e:
                    self.log(f"✗ Error generating UUIDs for {table_name}: {str(e)}", "ERROR")
    
    def create_foreign_key_columns(self):
        """Step 3: Create new foreign key columns"""
        self.log("=" * 60)
        self.log("STEP 3: Creating new foreign key columns")
        self.log("=" * 60)
        
        with db.engine.begin() as conn:
            fk_updates = [
                # Tracker table
                ('tracker', 'requirement_uuid', 'VARCHAR(36)'),
                ('tracker', 'profile_uuid', 'VARCHAR(36)'),
                
                # StatusTracker table
                ('status_tracker', 'requirement_uuid', 'VARCHAR(36)'),
                
                # SLATracker table
                ('sla_tracker', 'requirement_uuid', 'VARCHAR(36)'),
                
                # Meeting table
                ('meetings', 'requirement_uuid', 'VARCHAR(36)'),
                ('meetings', 'profile_uuid', 'VARCHAR(36)'),
                
                # Notification table
                ('notifications', 'user_uuid', 'VARCHAR(36)'),
                
                # WorkflowProgress table
                ('workflow_progress', 'requirement_uuid', 'VARCHAR(36)')
            ]
            
            for table_name, column_name, column_type in fk_updates:
                try:
                    # Check if table exists
                    result = conn.execute(text(f"""
                        SELECT COUNT(*) FROM information_schema.tables 
                        WHERE table_name = '{table_name}'
                    """))
                    
                    if result.scalar() == 0:
                        continue
                    
                    conn.execute(text(f"""
                        ALTER TABLE {table_name} 
                        ADD COLUMN IF NOT EXISTS {column_name} {column_type}
                    """))
                    
                    self.log(f"✓ Added {column_name} to {table_name}")
                    
                except Exception as e:
                    self.log(f"✗ Error adding {column_name} to {table_name}: {str(e)}", "ERROR")
    
    def update_foreign_keys(self):
        """Step 4: Update foreign key values to UUIDs"""
        self.log("=" * 60)
        self.log("STEP 4: Updating foreign key references")
        self.log("=" * 60)
        
        with db.engine.begin() as conn:
            # Update Tracker foreign keys
            try:
                # Update requirement_uuid based on request_id
                conn.execute(text("""
                    UPDATE tracker t
                    SET requirement_uuid = r.new_uuid
                    FROM requirements r
                    WHERE t.request_id = r.request_id
                """))
                
                # Update profile_uuid based on student_id
                conn.execute(text("""
                    UPDATE tracker t
                    SET profile_uuid = p.new_uuid
                    FROM profiles p
                    WHERE t.student_id = p.student_id
                """))
                
                self.log("✓ Updated Tracker foreign keys")
            except Exception as e:
                self.log(f"✗ Error updating Tracker foreign keys: {str(e)}", "ERROR")
            
            # Update StatusTracker foreign keys
            try:
                conn.execute(text("""
                    UPDATE status_tracker st
                    SET requirement_uuid = r.new_uuid
                    FROM requirements r
                    WHERE st.request_id = r.request_id
                """))
                
                self.log("✓ Updated StatusTracker foreign keys")
            except Exception as e:
                self.log(f"✗ Error updating StatusTracker foreign keys: {str(e)}", "ERROR")
            
            # Update SLATracker foreign keys
            try:
                conn.execute(text("""
                    UPDATE sla_tracker st
                    SET requirement_uuid = r.new_uuid
                    FROM requirements r
                    WHERE st.request_id = r.request_id
                """))
                
                self.log("✓ Updated SLATracker foreign keys")
            except Exception as e:
                self.log(f"✗ Error updating SLATracker foreign keys: {str(e)}", "ERROR")
            
            # Update Meeting foreign keys
            try:
                conn.execute(text("""
                    UPDATE meetings m
                    SET requirement_uuid = r.new_uuid
                    FROM requirements r
                    WHERE m.request_id = r.request_id
                """))
                
                conn.execute(text("""
                    UPDATE meetings m
                    SET profile_uuid = p.new_uuid
                    FROM profiles p
                    WHERE m.candidate_id = p.student_id
                """))
                
                self.log("✓ Updated Meeting foreign keys")
            except Exception as e:
                self.log(f"✗ Error updating Meeting foreign keys: {str(e)}", "ERROR")
            
            # Update Notification foreign keys
            try:
                conn.execute(text("""
                    UPDATE notifications n
                    SET user_uuid = u.new_uuid
                    FROM users u
                    WHERE n.user_id = u.id
                """))
                
                self.log("✓ Updated Notification foreign keys")
            except Exception as e:
                self.log(f"✗ Error updating Notification foreign keys: {str(e)}", "ERROR")
            
            # Update WorkflowProgress foreign keys
            try:
                conn.execute(text("""
                    UPDATE workflow_progress wp
                    SET requirement_uuid = r.new_uuid
                    FROM requirements r
                    WHERE wp.request_id = r.request_id
                """))
                
                self.log("✓ Updated WorkflowProgress foreign keys")
            except Exception as e:
                self.log(f"✗ Error updating WorkflowProgress foreign keys: {str(e)}", "ERROR")
    
    def swap_columns(self):
        """Step 5: Swap old columns with new UUID columns"""
        self.log("=" * 60)
        self.log("STEP 5: Swapping columns (FINAL STEP)")
        self.log("=" * 60)
        
        with db.engine.begin() as conn:
            # Disable foreign key constraints
            if 'sqlite' in str(db.engine.url):
                conn.execute(text("PRAGMA foreign_keys = OFF"))
            elif 'mysql' in str(db.engine.url):
                conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
            elif 'postgresql' in str(db.engine.url):
                conn.execute(text("SET session_replication_role = 'replica'"))
            
            try:
                # For each table, rename columns
                column_swaps = [
                    # Table name, old PK name, old PK to backup name, new UUID to PK name
                    ('users', 'id', 'id_old', 'new_uuid', 'id'),
                    ('profiles', 'student_id', 'student_id_backup', 'new_uuid', 'id'),
                    ('requirements', 'id', 'id_old', 'new_uuid', 'id'),
                    ('tracker', 'id', 'id_old', 'new_uuid', 'id'),
                    ('status_tracker', 'id', 'id_old', 'new_uuid', 'id'),
                    ('sla_tracker', 'id', 'id_old', 'new_uuid', 'id'),
                    ('sla_config', 'id', 'id_old', 'new_uuid', 'id'),
                    ('meetings', 'id', 'id_old', 'new_uuid', 'id'),
                    ('notifications', 'id', 'id_old', 'new_uuid', 'id'),
                    ('workflow_progress', 'id', 'id_old', 'new_uuid', 'id'),
                    ('system_settings', 'id', 'id_old', 'new_uuid', 'id')
                ]
                
                for table_name, old_pk, old_pk_backup, new_uuid_col, final_pk_name in column_swaps:
                    try:
                        # Check if table exists
                        result = conn.execute(text(f"""
                            SELECT COUNT(*) FROM information_schema.tables 
                            WHERE table_name = '{table_name}'
                        """))
                        
                        if result.scalar() == 0:
                            continue
                        
                        # Rename old PK column
                        conn.execute(text(f"""
                            ALTER TABLE {table_name} 
                            RENAME COLUMN {old_pk} TO {old_pk_backup}
                        """))
                        
                        # Rename new UUID column to be the PK
                        conn.execute(text(f"""
                            ALTER TABLE {table_name} 
                            RENAME COLUMN {new_uuid_col} TO {final_pk_name}
                        """))
                        
                        self.log(f"✓ Swapped columns for {table_name}")
                        
                    except Exception as e:
                        self.log(f"✗ Error swapping columns for {table_name}: {str(e)}", "ERROR")
                
                # Update foreign key columns
                fk_renames = [
                    ('tracker', 'requirement_uuid', 'requirement_id'),
                    ('tracker', 'profile_uuid', 'profile_id'),
                    ('status_tracker', 'requirement_uuid', 'requirement_id'),
                    ('sla_tracker', 'requirement_uuid', 'requirement_id'),
                    ('meetings', 'requirement_uuid', 'requirement_id'),
                    ('meetings', 'profile_uuid', 'profile_id'),
                    ('notifications', 'user_uuid', 'user_id'),
                    ('workflow_progress', 'requirement_uuid', 'requirement_id')
                ]
                
                for table_name, old_fk, new_fk in fk_renames:
                    try:
                        # Check if target column already exists
                        result = conn.execute(text(f"""
                            SELECT COUNT(*) FROM information_schema.columns
                            WHERE table_name = '{table_name}'
                            AND column_name = '{new_fk}'
                        """))

                        if result.scalar() > 0:
                            # Target column exists, drop the old FK column instead
                            conn.execute(text(f"""
                                ALTER TABLE {table_name}
                                DROP COLUMN {old_fk}
                            """))
                            self.log(f"✓ Dropped {old_fk} in {table_name} (target column already exists)")
                        else:
                            # Rename the column
                            conn.execute(text(f"""
                                ALTER TABLE {table_name}
                                RENAME COLUMN {old_fk} TO {new_fk}
                            """))
                            self.log(f"✓ Renamed {old_fk} to {new_fk} in {table_name}")

                    except Exception as e:
                        self.log(f"✗ Error handling FK in {table_name}: {str(e)}", "ERROR")
                
            finally:
                # Re-enable foreign key constraints
                if 'sqlite' in str(db.engine.url):
                    conn.execute(text("PRAGMA foreign_keys = ON"))
                elif 'mysql' in str(db.engine.url):
                    conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
                elif 'postgresql' in str(db.engine.url):
                    conn.execute(text("SET session_replication_role = 'origin'"))
    
    def verify_migration(self):
        """Verify the migration was successful"""
        self.log("=" * 60)
        self.log("VERIFICATION: Checking migration results")
        self.log("=" * 60)
        
        with db.engine.connect() as conn:
            tables = [
                'users', 'profiles', 'requirements', 'tracker',
                'status_tracker', 'sla_tracker', 'sla_config',
                'meetings', 'notifications', 'workflow_progress',
                'system_settings'
            ]
            
            all_success = True
            
            for table_name in tables:
                try:
                    # Check if table exists
                    result = conn.execute(text(f"""
                        SELECT COUNT(*) FROM information_schema.tables 
                        WHERE table_name = '{table_name}'
                    """))
                    
                    if result.scalar() == 0:
                        continue
                    
                    # Check for UUID column named 'id'
                    result = conn.execute(text(f"""
                        SELECT column_name, data_type 
                        FROM information_schema.columns 
                        WHERE table_name = '{table_name}' 
                        AND column_name = 'id'
                    """))
                    
                    column_info = result.fetchone()
                    
                    if column_info and 'char' in column_info[1].lower():
                        self.log(f"✓ {table_name}: UUID column verified")
                    else:
                        self.log(f"✗ {table_name}: UUID column NOT found", "WARNING")
                        all_success = False
                    
                except Exception as e:
                    self.log(f"✗ Error verifying {table_name}: {str(e)}", "ERROR")
                    all_success = False
            
            return all_success
    
    def run_migration(self):
        """Run the complete migration"""
        self.log("Starting UUID Migration Process")
        self.log("=" * 60)
        
        try:
            # Step 0: Backup database
            backup_file = self.backup_database()
            
            # Step 1: Add UUID columns
            self.create_uuid_columns()
            
            # Step 2: Generate UUIDs
            self.generate_uuids()
            
            # Step 3: Create FK columns
            self.create_foreign_key_columns()
            
            # Step 4: Update FK values
            self.update_foreign_keys()
            
            # Step 5: Swap columns
            self.swap_columns()
            
            # Step 6: Verify
            success = self.verify_migration()
            
            # Save mappings
            mapping_file = self.save_mappings()
            
            if success:
                self.log("=" * 60)
                self.log("✅ UUID MIGRATION COMPLETED SUCCESSFULLY!")
                self.log(f"Backup saved to: {backup_file}")
                self.log(f"ID mappings saved to: {mapping_file}")
                self.log("=" * 60)
            else:
                self.log("=" * 60)
                self.log("⚠️  UUID MIGRATION COMPLETED WITH WARNINGS!")
                self.log("Please review the logs above for details.")
                self.log(f"Backup saved to: {backup_file}")
                self.log(f"ID mappings saved to: {mapping_file}")
                self.log("=" * 60)
            
            return success
            
        except Exception as e:
            self.log(f"✗ MIGRATION FAILED: {str(e)}", "ERROR")
            self.log("Please restore from backup if needed.", "ERROR")
            return False


def main():
    print("\n" + "=" * 60)
    print("UUID MIGRATION TOOL")
    print("=" * 60)
    print("\n⚠️  WARNING: This will modify your database structure!")
    print("Make sure you have a backup before proceeding.")
    print("\nThis migration will:")
    print("1. Convert all integer/string primary keys to UUIDs")
    print("2. Update all foreign key relationships")
    print("3. Preserve all existing data")
    print("\n" + "=" * 60)

    # Check if running in non-interactive mode
    if os.getenv('NON_INTERACTIVE_MIGRATION') == 'true':
        print("Running in non-interactive mode...")
        response = 'yes'
    else:
        response = input("\nDo you want to proceed? (yes/no): ").strip().lower()

    if response != 'yes':
        print("Migration cancelled.")
        return

    migration = UUIDMigration()
    success = migration.run_migration()

    if success:
        print("\n✅ Migration completed successfully!")
        print("You can now use your application with UUID primary keys.")
    else:
        print("\n⚠️  Migration completed with issues.")
        print("Please review the logs and consider restoring from backup if needed.")


if __name__ == "__main__":
    main()
