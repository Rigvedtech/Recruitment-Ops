"""
Flask Application Entry Point

⚠️  WARNING: This file uses Flask's development server.
⚠️  DO NOT USE IN PRODUCTION!

For Production:
    Use: python production_server.py
    
For Development:
    Use: python run.py
"""

from app import create_app
import os
import sys

app = create_app()

# Print out registered routes for debugging
print("\nRegistered Routes:")
for rule in app.url_map.iter_rules():
    print(f"{rule.endpoint}: {rule.rule}")
print("\n")

if __name__ == '__main__':
    # Check if this is being run in a production-like environment
    environment = os.getenv('FLASK_ENV', os.getenv('ENVIRONMENT', 'development')).lower()
    
    if environment in ('production', 'prod'):
        print("\n" + "="*70)
        print("❌ ERROR: Cannot use Flask development server in production!".center(70))
        print("="*70)
        print("\n  Flask's built-in server is NOT suitable for production use.")
        print("  It is single-threaded, insecure, and not optimized.\n")
        print("  ✅ For production, use:")
        print("     python production_server.py\n")
        print("  Or set FLASK_ENV=development to run in development mode.")
        print("\n" + "="*70 + "\n")
        sys.exit(1)
    
    # Development mode warnings
    print("\n" + "="*70)
    print("⚠️  DEVELOPMENT MODE".center(70))
    print("="*70)
    print("\n  You are running Flask's built-in development server.")
    print("  This is ONLY suitable for local development and testing.\n")
    print("  Features:")
    print("    - Auto-reload on code changes")
    print("    - Debug mode enabled")
    print("    - Single-threaded (handles one request at a time)")
    print("    - NOT suitable for multiple users\n")
    print("  For production deployment, use:")
    print("    python production_server.py")
    print("\n" + "="*70 + "\n")
    
    port = int(os.getenv('BACKEND_PORT', 5000))
    
    # Run development server
    app.run(port=port, host='0.0.0.0', debug=True) 