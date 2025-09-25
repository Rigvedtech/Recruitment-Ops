"""
Database Backup and Restore Utility for UUID Migration
This script handles backing up the current database before migration
and provides restore capabilities if needed.
"""

import os
import sys
import json
import subprocess
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db
from sqlalchemy import text

class DatabaseBackup:
    def __init__(self):
        self.app = create_app()
        self.app.app_context().push()
        self.backup_dir = Path('database_backups')
        self.backup_dir.mkdir(exist_ok=True)
        
    def backup_to_json(self):
        """Create a JSON backup of all data with relationships preserved"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = self.backup_dir / f'backup_{timestamp}.json'
        
        backup_data = {
            'timestamp': timestamp,
            'tables': {}
        }
        
        # Define table order to respect foreign key constraints
        table_order = [
            'users',
            'profiles', 
            'requirements',
            'tracker',
            'status_tracker',
            'sla_config',
            'sla_tracker',
            'meetings',
            'notifications',
            'workflow_progress',
            'system_settings'
        ]
        
        with db.engine.connect() as conn:
            for table in table_order:
                try:
                    # Get all data from table
                    result = conn.execute(text(f"SELECT * FROM {table}"))
                    rows = result.fetchall()
                    
                    # Convert rows to dictionaries
                    table_data = []
                    for row in rows:
                        row_dict = dict(row._mapping)
                        # Convert datetime objects to strings
                        for key, value in row_dict.items():
                            if hasattr(value, 'isoformat'):
                                row_dict[key] = value.isoformat()
                        table_data.append(row_dict)
                    
                    backup_data['tables'][table] = {
                        'row_count': len(table_data),
                        'data': table_data
                    }
                    
                    print(f"✓ Backed up {len(table_data)} rows from {table}")
                    
                except Exception as e:
                    print(f"✗ Error backing up {table}: {str(e)}")
                    backup_data['tables'][table] = {
                        'error': str(e),
                        'row_count': 0,
                        'data': []
                    }
        
        # Save backup to file
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Backup saved to: {backup_file}")
        return backup_file
    
    def backup_to_sql(self):
        """Create a SQL dump backup using database-specific tools"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = self.backup_dir / f'backup_{timestamp}.sql'
        
        # Get database URL from config
        db_url = self.app.config.get('SQLALCHEMY_DATABASE_URI', '')
        
        if 'sqlite' in db_url:
            # For SQLite - copy the database file
            db_path = db_url.replace('sqlite:///', '')
            import shutil
            shutil.copy2(db_path, backup_file.with_suffix('.db'))
            print(f"✅ SQLite database backed up to: {backup_file.with_suffix('.db')}")
            
        elif 'postgresql' in db_url:
            # For PostgreSQL - use pg_dump
            try:
                # Parse connection string
                import re
                match = re.match(r'postgresql://([^:]+):([^@]+)@([^/]+)/(.+)', db_url)
                if match:
                    user, password, host, database = match.groups()
                    
                    cmd = [
                        'pg_dump',
                        f'--host={host}',
                        f'--username={user}',
                        f'--dbname={database}',
                        f'--file={backup_file}',
                        '--verbose'
                    ]
                    
                    env = os.environ.copy()
                    env['PGPASSWORD'] = password
                    
                    subprocess.run(cmd, env=env, check=True)
                    print(f"✅ PostgreSQL database backed up to: {backup_file}")
                    
            except Exception as e:
                print(f"✗ Error creating PostgreSQL backup: {str(e)}")
                print("Falling back to JSON backup...")
                return self.backup_to_json()
                
        elif 'mysql' in db_url:
            # For MySQL - use mysqldump
            try:
                import re
                match = re.match(r'mysql[^:]*://([^:]+):([^@]+)@([^/]+)/(.+)', db_url)
                if match:
                    user, password, host, database = match.groups()
                    
                    cmd = [
                        'mysqldump',
                        f'--host={host}',
                        f'--user={user}',
                        f'--password={password}',
                        f'--databases', database,
                        f'--result-file={backup_file}'
                    ]
                    
                    subprocess.run(cmd, check=True)
                    print(f"✅ MySQL database backed up to: {backup_file}")
                    
            except Exception as e:
                print(f"✗ Error creating MySQL backup: {str(e)}")
                print("Falling back to JSON backup...")
                return self.backup_to_json()
        else:
            # Default to JSON backup
            return self.backup_to_json()
        
        return backup_file
    
    def list_backups(self):
        """List all available backups"""
        backups = list(self.backup_dir.glob('backup_*.*'))
        
        if not backups:
            print("No backups found.")
            return []
        
        print("\nAvailable backups:")
        print("-" * 50)
        
        for idx, backup in enumerate(sorted(backups, reverse=True)):
            size = backup.stat().st_size / (1024 * 1024)  # Size in MB
            print(f"{idx + 1}. {backup.name} ({size:.2f} MB)")
        
        return sorted(backups, reverse=True)
    
    def restore_from_json(self, backup_file):
        """Restore database from JSON backup"""
        print(f"\n⚠️  WARNING: This will ERASE all current data and restore from backup!")
        response = input("Are you sure you want to continue? (yes/no): ")
        
        if response.lower() != 'yes':
            print("Restore cancelled.")
            return False
        
        try:
            with open(backup_file, 'r', encoding='utf-8') as f:
                backup_data = json.load(f)
            
            print(f"\nRestoring backup from: {backup_data['timestamp']}")
            
            # Disable foreign key constraints temporarily
            with db.engine.begin() as conn:
                if 'sqlite' in str(db.engine.url):
                    conn.execute(text("PRAGMA foreign_keys = OFF"))
                elif 'mysql' in str(db.engine.url):
                    conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
                elif 'postgresql' in str(db.engine.url):
                    # Get all tables
                    for table in backup_data['tables'].keys():
                        conn.execute(text(f"ALTER TABLE {table} DISABLE TRIGGER ALL"))
                
                # Clear existing data (in reverse order)
                for table in reversed(list(backup_data['tables'].keys())):
                    try:
                        conn.execute(text(f"DELETE FROM {table}"))
                        print(f"✓ Cleared table: {table}")
                    except Exception as e:
                        print(f"✗ Error clearing {table}: {str(e)}")
                
                # Restore data (in original order)
                for table, table_info in backup_data['tables'].items():
                    if 'error' not in table_info and table_info['data']:
                        for row in table_info['data']:
                            # Build INSERT statement
                            columns = list(row.keys())
                            values = list(row.values())
                            
                            placeholders = ', '.join([f":{col}" for col in columns])
                            col_list = ', '.join(columns)
                            
                            sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"
                            
                            # Convert string dates back to datetime if needed
                            for key, value in row.items():
                                if value and isinstance(value, str) and 'T' in value:
                                    try:
                                        from datetime import datetime
                                        row[key] = datetime.fromisoformat(value)
                                    except:
                                        pass
                            
                            conn.execute(text(sql), row)
                        
                        print(f"✓ Restored {table_info['row_count']} rows to {table}")
                
                # Re-enable foreign key constraints
                if 'sqlite' in str(db.engine.url):
                    conn.execute(text("PRAGMA foreign_keys = ON"))
                elif 'mysql' in str(db.engine.url):
                    conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
                elif 'postgresql' in str(db.engine.url):
                    for table in backup_data['tables'].keys():
                        conn.execute(text(f"ALTER TABLE {table} ENABLE TRIGGER ALL"))
            
            print("\n✅ Database successfully restored from backup!")
            return True
            
        except Exception as e:
            print(f"\n✗ Error restoring backup: {str(e)}")
            return False

def main():
    backup = DatabaseBackup()
    
    print("Database Backup and Restore Utility")
    print("=" * 40)
    print("1. Create backup (JSON)")
    print("2. Create backup (SQL dump)")
    print("3. List backups")
    print("4. Restore from backup")
    print("5. Exit")
    
    choice = input("\nSelect option (1-5): ").strip()
    
    if choice == '1':
        backup.backup_to_json()
    elif choice == '2':
        backup.backup_to_sql()
    elif choice == '3':
        backup.list_backups()
    elif choice == '4':
        backups = backup.list_backups()
        if backups:
            backup_num = input("\nEnter backup number to restore: ").strip()
            try:
                backup_idx = int(backup_num) - 1
                if 0 <= backup_idx < len(backups):
                    backup_file = backups[backup_idx]
                    if backup_file.suffix == '.json':
                        backup.restore_from_json(backup_file)
                    else:
                        print("SQL restore not implemented. Please use database-specific tools.")
                else:
                    print("Invalid backup number.")
            except ValueError:
                print("Invalid input.")
    elif choice == '5':
        print("Exiting...")
    else:
        print("Invalid choice.")

if __name__ == "__main__":
    main()
