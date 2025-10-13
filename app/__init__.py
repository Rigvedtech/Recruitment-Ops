import os
from flask import Flask
from flask_cors import CORS
from flask_migrate import Migrate
from flask_apscheduler import APScheduler
from flask_jwt_extended import JWTManager
from app.routes.api import api_bp
from app.routes.main import main_bp
from app.routes.tracker_api import tracker_bp
from app.routes.sla_api import sla_bp
from app.routes.workflow_api import workflow_bp
from app.routes.reports_api import reports_bp
from app.routes.notification_api import notification_bp
from app.routes.domain_resolver_api import domain_resolver_api_bp
from app.routes.domain_test_api import domain_test_bp
from app.routes.redis_health_api import redis_health_bp
from app.database import init_db, db
from app.services.sla_service import SLAService
from app.middleware.domain_db_resolver import domain_db_resolver
from app.services.database_manager import database_manager
from app.services.redis_service import redis_service
from app.services.redis_domain_cache_service import enhanced_domain_cache_service
from config import Config

# Initialize APScheduler
scheduler = APScheduler()

# Initialize JWT Manager
jwt = JWTManager()

def create_app(config_name='default'):
    app = Flask(__name__)

    # Load configuration from Config class
    app.config.from_object(Config)

    # Initialize CORS with security settings
    CORS(app, 
         origins=[
            'http://rigved-rops.rigvedtech.com:3000',
            'https://rigved-rops.rigvedtech.com:3000',
             'http://rgvdit-rops.rigvedtech.com:3000',
             'https://rgvdit-rops.rigvedtech.com:3000',
             'http://finquest-rops.rigvedtech.com:3000',
             'https://finquest-rops.rigvedtech.com:3000',
             'http://finq-ops.rigvedtech.com:3000',
             'http://localhost:3000',
             'http://localhost:6969',
             'http://127.0.0.1:3000'
         ],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
         allow_headers=['Content-Type', 'Authorization', 'X-Original-Domain', 'X-Domain']
    )
    
    # Initialize JWT Manager
    jwt.init_app(app)

    # Initialize Redis service
    redis_service.init_app(app)
    
    # Reinitialize enhanced domain cache service after Redis is initialized
    enhanced_domain_cache_service.reinitialize_redis_connection()
    
    # Initialize domain database resolver middleware (BEFORE database init)
    domain_db_resolver.init_app(app)
    
    # Initialize database manager for domain isolation
    database_manager.init_app(app)

    # Initialize database
    init_db(app)

    # Setup domain-aware models for automatic domain-specific database routing
    try:
        from app.services.domain_aware_db import setup_domain_aware_models
        # Ensure we run inside an application context
        with app.app_context():
            setup_domain_aware_models()
        print("Domain-aware database models configured successfully!")
    except Exception as e:
        print(f"Warning: Could not configure domain-aware models: {e}")

    # Initialize Flask-Migrate
    migrate = Migrate(app, db)

    # Initialize default data (only after migrations are applied)
    # Note: Run 'flask db upgrade' before starting the application
    with app.app_context():
       # Initialize default SLA configurations
        try:
            SLAService.initialize_default_configs()
            print("Default SLA configurations initialized successfully!")
        except Exception as e:
            print(f"Warning: Could not initialize SLA configurations: {e}")

    # Create upload directories if they don't exist
    os.makedirs(os.path.join(app.root_path, 'uploads', 'attachments'), exist_ok=True)
    os.makedirs(os.path.join(app.root_path, 'uploads', 'exports'), exist_ok=True)

    # Register blueprints
    app.register_blueprint(main_bp)  # Register main routes first
    app.register_blueprint(api_bp)   # Then register API routes
    app.register_blueprint(tracker_bp)  # Register tracker routes
    app.register_blueprint(sla_bp)   # Register SLA routes
    app.register_blueprint(workflow_bp)  # Register workflow routes
    app.register_blueprint(reports_bp)  # Register reports routes
    app.register_blueprint(notification_bp)  # Register notification routes
    app.register_blueprint(domain_resolver_api_bp)  # Register domain resolver API routes
    app.register_blueprint(domain_test_bp)  # Register domain test API routes
    app.register_blueprint(redis_health_bp)  # Register Redis health API routes

    # Configure and start APScheduler
    app.config['SCHEDULER_API_ENABLED'] = False  # Disable built-in API routes to avoid conflicts
    app.config['SCHEDULER_TIMEZONE'] = 'Asia/Kolkata'  # IST timezone

    # Initialize scheduler with app
    scheduler.init_app(app)

    # Import and register scheduled jobs
    from app.scheduler import init_scheduler_jobs
    init_scheduler_jobs(scheduler)

    # Start the scheduler only if not disabled
    if os.getenv('DISABLE_SCHEDULER') != 'true':
        scheduler.start()
        print("APScheduler started successfully!")
    else:
        print("APScheduler disabled for migration/testing mode.")
    
    # Add domain isolation middleware for API requests
    @app.before_request
    def setup_domain_isolation():
        """Ensure domain-specific database session is available for API requests"""
        from flask import request
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Skip for static files and non-API endpoints
        if (request.endpoint and 
            (request.endpoint.startswith('static') or 
             not request.path.startswith('/api/'))):
            return
        
        # Skip for domain resolver API and domain test API (they handle their own isolation)
        if request.path.startswith(('/api/domain/', '/api/domain-test/')):
            return
        
        # Get domain from headers
        domain = request.headers.get('X-Original-Domain')
        if not domain:
            domain = request.headers.get('X-Domain')
        
        # Log the request for debugging
        logger.info(f"API Request: {request.method} {request.path}, Domain: {domain}")
        
        # Skip for localhost (uses default database)
        if domain and not domain.startswith(('localhost', '127.0.0.1')):
            try:
                logger.info(f"Setting up domain isolation for: {domain}")
                
                # Ensure domain database isolation is set up
                from app.services.database_manager import database_manager
                success = database_manager.ensure_domain_database_isolation()
                
                if success:
                    logger.info(f"Domain isolation successfully set up for: {domain}")
                else:
                    logger.warning(f"Failed to set up domain isolation for: {domain}")
                    
            except Exception as e:
                # Log error but don't break the request - let it fall back to default DB
                logger.error(f"Error setting up domain isolation for {domain}: {str(e)}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
        else:
            logger.debug(f"Using default database for domain: {domain}")
    
    # Add security headers
    @app.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['X-Permitted-Cross-Domain-Policies'] = 'none'
        return response

    # Print registered routes for debugging
    print("\nRegistered Routes:")
    for rule in app.url_map.iter_rules():
        print(f"{rule.endpoint}: {rule.rule}")
    print("\n")

    return app

def create_app_for_job():
    """
    Create a Flask app instance for scheduled jobs without initializing the scheduler.
    This prevents the SchedulerAlreadyRunningError when jobs create their own app context.
    """
    app = Flask(__name__)

    # Load configuration from Config class
    app.config.from_object(Config)

    # Initialize CORS
    CORS(app)

    # Initialize database
    init_db(app)

    # Initialize Flask-Migrate
    migrate = Migrate(app, db)

    # Create upload directories if they don't exist
    os.makedirs(os.path.join(app.root_path, 'uploads', 'attachments'), exist_ok=True)
    os.makedirs(os.path.join(app.root_path, 'uploads', 'exports'), exist_ok=True)

    # Register blueprints
    app.register_blueprint(main_bp)  # Register main routes first
    app.register_blueprint(api_bp)   # Then register API routes
    app.register_blueprint(tracker_bp)  # Register tracker routes
    app.register_blueprint(sla_bp)   # Register SLA routes
    app.register_blueprint(workflow_bp)  # Register workflow routes
    app.register_blueprint(notification_bp)  # Register notification routes
    app.register_blueprint(reports_bp)  # Register reports routes

    return app 