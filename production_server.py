"""
Production WSGI Server using Hypercorn
This is the production-ready server that should be used instead of Flask's dev server.

Usage:
    python production_server.py

Environment Variables:
    BACKEND_PORT - Port to run the server on (default: 1010)
    HYPERCORN_WORKERS - Number of worker processes (default: 2)
    HYPERCORN_THREADS - Number of threads per worker (default: 2)
    PRODUCTION_HOST - Host to bind to (default: 0.0.0.0)
    
For service/daemon deployment:
    - Windows: Use Task Scheduler or Windows Service
    - Linux: Use systemd
"""

import os
import sys
import logging
import asyncio
from pathlib import Path

# Ensure the project root is in the Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

# Import production configuration
import production_config

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler(os.path.join('logs', 'production_server.log')),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


def check_environment():
    """Verify that the environment is properly configured for production"""
    logger.info("Checking environment configuration...")
    
    required_env_vars = ['BACKEND_PORT']
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        logger.warning(f"Missing environment variables: {', '.join(missing_vars)}")
        logger.warning("Using default values. Set these in your environment for production.")
    
    # Check if logs directory exists
    logs_dir = os.path.join(PROJECT_ROOT, 'logs')
    if not os.path.exists(logs_dir):
        os.makedirs(logs_dir)
        logger.info(f"Created logs directory: {logs_dir}")
    
    # Verify debug mode is off
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 'yes')
    if debug_mode:
        logger.error("❌ FLASK_DEBUG is enabled! This is a security risk in production.")
        logger.error("   Set FLASK_DEBUG=False in your environment.")
        return False
    
    logger.info("✅ Environment check passed")
    return True


def create_production_app():
    """Create and configure the Flask application for production"""
    from app import create_app
    
    logger.info("Creating Flask application...")
    
    # Create app with production config
    app = create_app('production')
    
    # Disable Flask's debug mode explicitly
    app.debug = False
    app.config['DEBUG'] = False
    
    # Log registered routes
    logger.info("Registered Routes:")
    for rule in app.url_map.iter_rules():
        logger.info(f"  {rule.endpoint}: {rule.rule}")
    
    logger.info("✅ Flask application created successfully")
    return app


def run_server():
    """Start the production Hypercorn server"""
    from hypercorn.config import Config
    from hypercorn.asyncio import serve
    
    print("\n" + "="*70)
    print("RECRUITMENT OPERATIONS - PRODUCTION SERVER".center(70))
    print("="*70 + "\n")
    
    # Check environment
    if not check_environment():
        logger.error("Environment check failed. Please fix the issues above.")
        sys.exit(1)
    
    # Print configuration
    production_config.print_config()
    
    # Show recommendations if available
    try:
        recommendations = production_config.get_recommendations()
        if recommendations:
            print("PERFORMANCE RECOMMENDATIONS:")
            for rec in recommendations:
                print(f"  {rec}")
            print()
    except ImportError:
        pass  # psutil not available
    
    # Create Flask app
    try:
        app = create_production_app()
    except Exception as e:
        logger.error(f"Failed to create Flask application: {str(e)}", exc_info=True)
        sys.exit(1)
    
    # Configure Hypercorn
    config = Config()
    config.bind = [production_config.BIND]
    config.workers = production_config.WORKERS
    config.worker_class = production_config.WORKER_CLASS  # 'sync' for WSGI
    config.threads = production_config.THREADS
    config.keep_alive_timeout = production_config.KEEP_ALIVE_TIMEOUT
    config.graceful_timeout = production_config.GRACEFUL_TIMEOUT
    config.max_incomplete_size = production_config.MAX_INCOMPLETE_SIZE
    config.backlog = production_config.BACKLOG
    config.access_log_format = production_config.ACCESS_LOG_FORMAT
    
    # Logging configuration
    if production_config.ACCESS_LOG != '-':
        config.accesslog = production_config.ACCESS_LOG
    else:
        config.accesslog = None
    
    if production_config.ERROR_LOG != '-':
        config.errorlog = production_config.ERROR_LOG
    else:
        config.errorlog = None
    
    # Set log level
    log_level_map = {
        'debug': 'DEBUG',
        'info': 'INFO',
        'warning': 'WARNING',
        'error': 'ERROR',
        'critical': 'CRITICAL'
    }
    config.loglevel = log_level_map.get(production_config.LOG_LEVEL, 'INFO')
    
    # Start server
    logger.info(f"Starting Hypercorn server on {production_config.BIND}...")
    print(f"🚀 Server starting on http://{production_config.BIND}")
    print(f"📊 Workers: {production_config.WORKERS}")
    print(f"📊 Threads per Worker: {production_config.THREADS}")
    print(f"⚡ Total Threads: {production_config.WORKERS * production_config.THREADS}")
    print(f"\n{'='*70}")
    print("✅ Production server is running!")
    print(f"{'='*70}\n")
    print("Press Ctrl+C to stop the server gracefully.\n")
    
    try:
        # Run the WSGI application with Hypercorn
        asyncio.run(serve(app, config))
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received, shutting down...")
        print("\n\n" + "="*70)
        print("Server stopped by user.".center(70))
        print("="*70)
    except Exception as e:
        logger.error(f"Server error: {str(e)}", exc_info=True)
        print(f"\n❌ Server error: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    # Verify we're not running with Flask's dev server
    if 'flask run' in ' '.join(sys.argv).lower():
        print("\n" + "="*70)
        print("ERROR: Do not use 'flask run' in production!".center(70))
        print("Use: python production_server.py".center(70))
        print("="*70 + "\n")
        sys.exit(1)
    
    run_server()
