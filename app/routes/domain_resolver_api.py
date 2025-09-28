"""
Domain resolver API endpoints for frontend-initiated domain resolution
"""

from flask import Blueprint, request, jsonify, g, current_app
import logging
from app.middleware.domain_db_resolver import domain_db_resolver
from app.services.external_api_client import ExternalEnvironmentAPIClient
from app.services.connection_manager import set_db_session_for_domain, get_current_db_session
from app.database import db
from urllib.parse import urlparse

def get_db_session():
    """
    Get the correct database session for the current domain.
    Returns domain-specific session if available, otherwise falls back to global session.
    """
    if hasattr(g, 'db_session') and g.db_session is not None:
        return g.db_session
    else:
        # Fallback to global session for backward compatibility
        return db.session

logger = logging.getLogger(__name__)

domain_resolver_api_bp = Blueprint('domain_resolver_api', __name__, url_prefix='/api/domain')

@domain_resolver_api_bp.route('/resolve', methods=['POST'])
def resolve_domain():
    """
    Frontend-initiated domain resolution endpoint
    This endpoint is called by the frontend to initialize database connection for a domain
    """
    try:
        data = request.get_json()
        if not data or 'domain_url' not in data:
            return jsonify({
                'success': False,
                'error': 'domain_url is required'
            }), 400
        
        domain_url = data['domain_url']
        logger.info(f"Frontend requesting domain resolution for: {domain_url}")
        print(f"DEBUG: Frontend requesting domain resolution for: {domain_url}")
        
        # Use the domain URL as the domain identifier
        domain = domain_url.rstrip('/')
        
        # Store domain info in g context for this request
        g.current_domain = domain
        g.current_url = domain_url
        
        # If localhost, do NOT pass credentials or set domain session; use default SQLAlchemy config
        try:
            parsed = urlparse(domain_url)
            hostname = (parsed.hostname or '').lower()
            is_localhost = hostname in ['localhost', '127.0.0.1']
        except Exception:
            is_localhost = False

        if is_localhost:
            # Build DB info from app config (.env)
            db_info = {
                'host': current_app.config.get('DB_HOST'),
                'port': current_app.config.get('DB_PORT'),
                'database': current_app.config.get('DB_NAME'),
                'connection_test': False
            }
            try:
                test_result = get_db_session().execute("SELECT 1 as test").fetchone()
                db_info['connection_test'] = test_result is not None
            except Exception as e:
                logger.error(f"Local SQLAlchemy connection test failed: {str(e)}")
                db_info['error'] = str(e)

            return jsonify({
                'success': True,
                'data': {
                    'domain': domain,
                    'domain_url': domain_url,
                    'database_info': db_info,
                    'cached': False,
                    'mode': 'local_sqlalchemy'
                },
                'message': f'Domain {domain} resolved in localhost mode using .env config'
            })

        # Resolve database credentials using the domain resolver for non-localhost
        postgres_creds = domain_db_resolver.resolve_database_credentials(domain_url, domain)

        if not postgres_creds:
            logger.error(f"Could not resolve database credentials for domain: {domain}")
            return jsonify({
                'success': False,
                'error': 'Database configuration not found for this domain',
                'domain': domain
            }), 404

        # Set up database session for this domain
        success = set_db_session_for_domain(domain, postgres_creds)

        if not success:
            logger.error(f"Failed to set up database session for domain: {domain}")
            return jsonify({
                'success': False,
                'error': 'Database connection failed for this domain',
                'domain': domain
            }), 503
        
        # Test the database connection
        session = get_current_db_session()
        if session:
            try:
                # Test basic connection
                test_result = session.execute("SELECT 1 as test").fetchone()
                connection_test = test_result is not None
                
                # Get database info
                db_info = {
                    'host': postgres_creds.get('POSTGRES_HOST'),
                    'port': postgres_creds.get('POSTGRES_PORT'),
                    'database': postgres_creds.get('POSTGRES_DB'),
                    'connection_test': connection_test
                }
                
            except Exception as e:
                logger.error(f"Database connection test failed: {str(e)}")
                db_info = {
                    'connection_test': False,
                    'error': str(e)
                }
        else:
            db_info = {
                'connection_test': False,
                'error': 'No session available'
            }
        
        logger.info(f"Successfully resolved domain: {domain}")
        print(f"DEBUG: Successfully resolved domain: {domain}")
        
        return jsonify({
            'success': True,
            'data': {
                'domain': domain,
                'domain_url': domain_url,
                'database_info': db_info,
                'cached': domain_db_resolver.cache_service.is_domain_cached(domain)
            },
            'message': f'Domain {domain} resolved successfully'
        })
        
    except Exception as e:
        logger.error(f"Error in domain resolution: {str(e)}")
        print(f"DEBUG ERROR: Error in domain resolution: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@domain_resolver_api_bp.route('/status', methods=['GET'])
def get_domain_status():
    """
    Get current domain status and database connection info
    """
    try:
        domain = getattr(g, 'current_domain', None)
        session = get_current_db_session()
        
        if not domain:
            return jsonify({
                'success': False,
                'error': 'No domain context available'
            }), 400
        
        # Test database connection if session exists
        db_status = {
            'connected': False,
            'session_available': session is not None
        }
        
        if session:
            try:
                test_result = session.execute("SELECT 1 as test").fetchone()
                db_status['connected'] = test_result is not None
                db_status['session_id'] = id(session)
            except Exception as e:
                db_status['error'] = str(e)
        
        return jsonify({
            'success': True,
            'data': {
                'domain': domain,
                'database_status': db_status,
                'cache_info': domain_db_resolver.get_cache_stats()
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting domain status: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@domain_resolver_api_bp.route('/cache/clear', methods=['POST'])
def clear_domain_cache():
    """
    Clear domain credential cache
    """
    try:
        domain_db_resolver.clear_all_cache()
        
        return jsonify({
            'success': True,
            'message': 'Domain cache cleared successfully'
        })
        
    except Exception as e:
        logger.error(f"Error clearing domain cache: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@domain_resolver_api_bp.route('/test', methods=['GET'])
def test_domain_connection():
    """
    Test current domain database connection
    """
    try:
        domain = getattr(g, 'current_domain', None)
        session = get_current_db_session()
        
        if not session:
            return jsonify({
                'success': False,
                'error': 'No database session available for current domain'
            }), 503
        
        # Perform various database tests
        tests = {}
        
        # Test 1: Basic connection
        try:
            result = session.execute("SELECT 1 as test").fetchone()
            tests['basic_connection'] = result is not None
        except Exception as e:
            tests['basic_connection'] = False
            tests['basic_connection_error'] = str(e)
        
        # Test 2: Check if users table exists
        try:
            result = session.execute("SELECT COUNT(*) as count FROM users").fetchone()
            tests['users_table'] = result is not None
            tests['users_count'] = result[0] if result else 0
        except Exception as e:
            tests['users_table'] = False
            tests['users_table_error'] = str(e)
        
        return jsonify({
            'success': True,
            'data': {
                'domain': domain,
                'database_tests': tests
            }
        })
        
    except Exception as e:
        logger.error(f"Error testing domain connection: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
