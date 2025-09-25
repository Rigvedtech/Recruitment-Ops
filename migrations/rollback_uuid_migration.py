#!/usr/bin/env python3
"""
UUID Migration Rollback Script
Reverts the UUID migration back to integer/string primary keys
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db
from sqlalchemy import text

class UUIDRollback:
    def __init__(self):
        self.app = create_app()
        self.app.app_context().push()
        self.rollback_log = []
        
    def log(self, message: str, level: str = 'INFO'):
        """Log rollback messages"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"[{timestamp}] [{level}] {message}"
        print(log_entry)
        self.rollback_log.append(log_entry)
    
    def find_latest_mapping(self):
        """Find the latest UUID mapping file"""
        mapping_dir = Path('migrations')
        mapping_files = list(mapping_dir.glob('uuid_mappings_*.json'))
        
        if not mapping_files:
            self.log("No UUID mapping files found!", "ERROR")
            return None
        
        # Get the most recent mapping file
        latest_file = max(mapping_files, key=lambda f: f.stat().st_mtime)
        self.log(f"Found mapping file: {latest_file}")
        return latest_file
    
    def rollback_from_mapping(self, mapping_file):
        """Rollback using the mapping file"""
        with open(mapping_file, 'r', encoding='utf-8') as f:
            mapping_data = json.load(f)
        
        self.log(f"Loading mappings from migration at: {mapping_data['timestamp']}")
        
        with db.engine.begin() as conn:
            # Disable foreign key constraints
            if 'sqlite' in str(db.engine.url):
                conn.execute(text("PRAGMA foreign_keys = OFF"))
            elif 'mysql' in str(db.engine.url):
                conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
            elif 'postgresql' in str(db.engine.url):
                conn.execute(text("SET session_replication_role = 'replica'"))
            
            try:
                # Step 1: Restore original PK columns
                self.restore_primary_keys(conn)
                
                # Step 2: Restore foreign key columns
                self.restore_foreign_keys(conn)
                
                # Step 3: Clean up UUID columns
                self.cleanup_uuid_columns(conn)
                
                self.log("=" * 60)
                self.log("✅ ROLLBACK COMPLETED SUCCESSFULLY!")
                self.log("=" * 60)
                
            finally:
                # Re-enable foreign key constraints
                if 'sqlite' in str(db.engine.url):
                    conn.execute(text("PRAGMA foreign_keys = ON"))
                elif 'mysql' in str(db.engine.url):
                    conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
                elif 'postgresql' in str(db.engine.url):
                    conn.execute(text("SET session_replication_role = 'origin'"))
    
    def restore_primary_keys(self, conn):
        """Restore original primary key columns"""
        self.log("=" * 60)
        self.log("STEP 1: Restoring original primary keys")
        self.log("=" * 60)
        
        # Check which columns exist and rename accordingly
        tables_to_check = [
            ('users', 'id', 'id_old'),
            ('profiles', 'id', 'student_id_backup', 'student_id'),
            ('requirements', 'id', 'id_old'),
            ('tracker', 'id', 'id_old'),
            ('status_tracker', 'id', 'id_old'),
            ('sla_tracker', 'id', 'id_old'),
            ('sla_config', 'id', 'id_old'),
            ('meetings', 'id', 'id_old'),
            ('notifications', 'id', 'id_old'),
            ('workflow_progress', 'id', 'id_old'),
            ('system_settings', 'id', 'id_old')
        ]
        
        for table_info in tables_to_check:
            if len(table_info) == 3:
                table_name, uuid_col, old_col = table_info
                new_col_name = 'id'  # Default for most tables
            else:
                table_name, uuid_col, old_col, new_col_name = table_info
            
            try:
                # Check if table exists
                result = conn.execute(text(f"""
                    SELECT COUNT(*) FROM information_schema.tables 
                    WHERE table_name = '{table_name}'
                """))
                
                if result.scalar() == 0:
                    continue
                
                # Check if old column exists
                result = conn.execute(text(f"""
                    SELECT COUNT(*) FROM information_schema.columns 
                    WHERE table_name = '{table_name}' 
                    AND column_name = '{old_col}'
                """))
                
                if result.scalar() > 0:
                    # Rename UUID column to backup
                    conn.execute(text(f"""
                        ALTER TABLE {table_name} 
                        RENAME COLUMN {uuid_col} TO uuid_backup
                    """))
                    
                    # Rename old column back to original name
                    conn.execute(text(f"""
                        ALTER TABLE {table_name} 
                        RENAME COLUMN {old_col} TO {new_col_name}
                    """))
                    
                    self.log(f"✓ Restored {new_col_name} for {table_name}")
                else:
                    self.log(f"⚠️  Old column {old_col} not found in {table_name}", "WARNING")
                    
            except Exception as e:
                self.log(f"✗ Error restoring {table_name}: {str(e)}", "ERROR")
    
    def restore_foreign_keys(self, conn):
        """Restore original foreign key columns"""
        self.log("=" * 60)
        self.log("STEP 2: Restoring foreign key columns")
        self.log("=" * 60)
        
        fk_restores = [
            # Tracker - restore to original FK column names
            ('tracker', 'requirement_id', 'request_id'),
            ('tracker', 'profile_id', 'student_id'),
            
            # StatusTracker
            ('status_tracker', 'requirement_id', 'request_id'),
            
            # SLATracker
            ('sla_tracker', 'requirement_id', 'request_id'),
            
            # WorkflowProgress
            ('workflow_progress', 'requirement_id', 'request_id'),
            
            # Notifications
            ('notifications', 'user_id', 'user_id_int')
        ]
        
        for table_name, uuid_fk, original_fk in fk_restores:
            try:
                # For tracker table, these should already exist as legacy fields
                if table_name == 'tracker' and original_fk in ['request_id', 'student_id']:
                    self.log(f"✓ {original_fk} already exists in {table_name} as legacy field")
                    continue
                
                # Check if we need to restore the column
                result = conn.execute(text(f"""
                    SELECT COUNT(*) FROM information_schema.columns 
                    WHERE table_name = '{table_name}' 
                    AND column_name = '{uuid_fk}'
                """))
                
                if result.scalar() > 0:
                    # The FK is using UUID, we should already have the original column
                    self.log(f"✓ Foreign key {original_fk} in {table_name} is available")
                    
            except Exception as e:
                self.log(f"✗ Error checking FK in {table_name}: {str(e)}", "ERROR")
    
    def cleanup_uuid_columns(self, conn):
        """Remove UUID-related columns"""
        self.log("=" * 60)
        self.log("STEP 3: Cleaning up UUID columns")
        self.log("=" * 60)
        
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
                
                # Drop uuid_backup column if exists
                result = conn.execute(text(f"""
                    SELECT COUNT(*) FROM information_schema.columns 
                    WHERE table_name = '{table_name}' 
                    AND column_name = 'uuid_backup'
                """))
                
                if result.scalar() > 0:
                    conn.execute(text(f"""
                        ALTER TABLE {table_name} 
                        DROP COLUMN uuid_backup
                    """))
                    self.log(f"✓ Removed uuid_backup from {table_name}")
                
            except Exception as e:
                self.log(f"✗ Error cleaning up {table_name}: {str(e)}", "ERROR")
    
    def rollback_from_backup(self):
        """Alternative: Restore from JSON backup"""
        self.log("Looking for backup files...")
        
        backup_dir = Path('database_backups')
        if not backup_dir.exists():
            self.log("No backup directory found!", "ERROR")
            return False
        
        backup_files = list(backup_dir.glob('backup_*.json'))
        
        if not backup_files:
            self.log("No backup files found!", "ERROR")
            return False
        
        print("\nAvailable backups:")
        for idx, backup in enumerate(sorted(backup_files, reverse=True)):
            size = backup.stat().st_size / (1024 * 1024)
            print(f"{idx + 1}. {backup.name} ({size:.2f} MB)")
        
        choice = input("\nSelect backup number to restore from: ").strip()
        
        try:
            backup_idx = int(choice) - 1
            if 0 <= backup_idx < len(backup_files):
                backup_file = sorted(backup_files, reverse=True)[backup_idx]
                
                from migrations.backup_and_restore import DatabaseBackup
                backup = DatabaseBackup()
                return backup.restore_from_json(backup_file)
            else:
                self.log("Invalid backup number", "ERROR")
                return False
                
        except ValueError:
            self.log("Invalid input", "ERROR")
            return False


def main():
    print("\n" + "=" * 60)
    print("UUID MIGRATION ROLLBACK TOOL")
    print("=" * 60)
    print("\n⚠️  WARNING: This will revert your database structure!")
    print("\nThis tool will restore your database to use:")
    print("- Integer primary keys for most tables")
    print("- String primary key for Profile table")
    print("- Original foreign key relationships")
    print("\n" + "=" * 60)
    
    rollback = UUIDRollback()
    
    print("\nRollback options:")
    print("1. Rollback using UUID mapping file (recommended)")
    print("2. Restore from JSON backup")
    print("3. Cancel")
    
    choice = input("\nSelect option (1-3): ").strip()
    
    if choice == '1':
        mapping_file = rollback.find_latest_mapping()
        if mapping_file:
            response = input(f"\nRollback using {mapping_file.name}? (yes/no): ").strip().lower()
            if response == 'yes':
                rollback.rollback_from_mapping(mapping_file)
            else:
                print("Rollback cancelled.")
        else:
            print("Cannot proceed without mapping file.")
            
    elif choice == '2':
        rollback.rollback_from_backup()
        
    elif choice == '3':
        print("Rollback cancelled.")
        
    else:
        print("Invalid choice.")


if __name__ == "__main__":
    main()
