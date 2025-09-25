#!/usr/bin/env python3
"""
Simple migration runner script
Runs the UUID migration without interactive prompts
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Disable scheduler during migration
os.environ['DISABLE_SCHEDULER'] = 'true'

from migrate_to_uuid import UUIDMigration

def main():
    print("Starting UUID Migration (Non-Interactive Mode)")
    print("=" * 50)

    migration = UUIDMigration()
    success = migration.run_migration()

    if success:
        print("\n✅ Migration completed successfully!")
    else:
        print("\n⚠️  Migration completed with issues.")
        print("Please check the migration logs for details.")

if __name__ == "__main__":
    main()
