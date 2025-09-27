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
from app.routes.notification_api import notification_bp
from app.routes.domain_resolver_api import domain_resolver_api_bp
from app.database import init_db, db
from app.services.sla_service import SLAService
from app.middleware.domain_db_resolver import domain_db_resolver
from app.services.database_manager import database_manager
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
             'http://rgvdit-rops.rigvedtech.com:3000',
             'https://rgvdit-rops.rigvedtech.com:3000',
             'http://finquest-rops.rigvedtech.com:3000',
             'https://finquest-rops.rigvedtech.com:3000',
             'http://finq-ops.rigvedtech.com:3000',
             'http://localhost:3000',
             'http://127.0.0.1:3000'
         ],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
         allow_headers=['Content-Type', 'Authorization', 'X-Original-Domain', 'X-Domain']
    )
    
    # Initialize JWT Manager
    jwt.init_app(app)

    # Initialize domain database resolver middleware (BEFORE database init)
    domain_db_resolver.init_app(app)
    
    # Initialize database manager for domain isolation
    database_manager.init_app(app)

    # Initialize database
    init_db(app)

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
    app.register_blueprint(notification_bp)  # Register notification routes
    app.register_blueprint(domain_resolver_api_bp)  # Register domain resolver API routes

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

    return app 