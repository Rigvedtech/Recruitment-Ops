import logging
from functools import wraps
from flask import request, jsonify, current_app, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.database_manager import database_manager
from app.models.user import User

logger = logging.getLogger(__name__)

def require_domain_auth(f):
    """
    Decorator to require domain-specific authentication with database isolation
    
    This decorator ensures that:
    1. The request is using the correct database for its domain
    2. The user exists in the domain-specific database
    3. Cross-database user access is prevented
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            # Get domain from request
            domain = database_manager.get_domain_from_request()
            if not domain:
                logger.error("Could not determine domain from request")
                return jsonify({
                    'status': 'error',
                    'message': 'Could not determine domain from request'
                }), 400
            
            # Ensure domain database isolation
            if not database_manager.ensure_domain_database_isolation():
                logger.error(f"Failed to ensure domain database isolation for: {domain}")
                return jsonify({
                    'status': 'error',
                    'message': 'Database not available for this domain'
                }), 503
            
            # Get user from request headers
            auth_header = request.headers.get('Authorization')
            if not auth_header:
                return jsonify({
                    'status': 'error',
                    'message': 'Authorization header required'
                }), 401
            
            try:
                # Extract username from Authorization header
                # Format: "Bearer username"
                parts = auth_header.split(' ')
                if len(parts) != 2 or parts[0] != 'Bearer':
                    return jsonify({
                        'status': 'error',
                        'message': 'Invalid authorization format'
                    }), 401
                
                username = parts[1].strip()
                
                # Validate user belongs to current domain's database
                if not database_manager.validate_user_belongs_to_domain(username, domain):
                    logger.warning(f"User {username} not found in domain {domain} database")
                    return jsonify({
                        'status': 'error',
                        'message': 'User not found in this domain'
                    }), 401
                
                # Get user from domain-specific database
                if not hasattr(g, 'db_session') or g.db_session is None:
                    logger.error("No database session available for user lookup")
                    return jsonify({
                        'status': 'error',
                        'message': 'Database session not available'
                    }), 503
                
                user = g.db_session.query(User).filter_by(username=username).first()
                if not user:
                    logger.warning(f"User {username} not found in domain {domain} database")
                    return jsonify({
                        'status': 'error',
                        'message': 'User not found in this domain'
                    }), 401
                
                # Add user and domain to request context
                request.current_user = user
                request.current_domain = domain
                
                logger.info(f"User {username} authenticated for domain {domain}")
                return f(*args, **kwargs)
                
            except Exception as e:
                logger.error(f"Error in domain authentication: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': 'Authentication failed'
                }), 401
                
        except Exception as e:
            logger.error(f"Error in require_domain_auth decorator: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': 'Authentication system error'
            }), 500
    
    return decorated_function

def require_jwt_domain_auth(f):
    """
    Decorator to require JWT authentication with domain-specific database isolation
    
    This decorator ensures that:
    1. Valid JWT token is provided
    2. The request is using the correct database for its domain
    3. The user exists in the domain-specific database
    4. Cross-database user access is prevented
    """
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        try:
            # Get username from JWT token
            username = get_jwt_identity()
            if not username:
                return jsonify({
                    'status': 'error',
                    'message': 'Invalid JWT token'
                }), 401
            
            # Get domain from request
            domain = database_manager.get_domain_from_request()
            if not domain:
                logger.error("Could not determine domain from request")
                return jsonify({
                    'status': 'error',
                    'message': 'Could not determine domain from request'
                }), 400
            
            # Ensure domain database isolation
            if not database_manager.ensure_domain_database_isolation():
                logger.error(f"Failed to ensure domain database isolation for: {domain}")
                return jsonify({
                    'status': 'error',
                    'message': 'Database not available for this domain'
                }), 503
            
            # Validate user belongs to current domain's database
            if not database_manager.validate_user_belongs_to_domain(username, domain):
                logger.warning(f"User {username} not found in domain {domain} database")
                return jsonify({
                    'status': 'error',
                    'message': 'User not found in this domain'
                }), 401
            
            # Get user from domain-specific database
            if not hasattr(g, 'db_session') or g.db_session is None:
                logger.error("No database session available for user lookup")
                return jsonify({
                    'status': 'error',
                    'message': 'Database session not available'
                }), 503
            
            user = g.db_session.query(User).filter_by(username=username).first()
            if not user:
                logger.warning(f"User {username} not found in domain {domain} database")
                return jsonify({
                    'status': 'error',
                    'message': 'User not found in this domain'
                }), 401
            
            # Add user and domain to request context
            request.current_user = user
            request.current_domain = domain
            
            logger.info(f"User {username} authenticated via JWT for domain {domain}")
            return f(*args, **kwargs)
            
        except Exception as e:
            logger.error(f"Error in JWT domain authentication: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': 'Authentication system error'
            }), 500
    
    return decorated_function

def require_domain_role(allowed_roles):
    """
    Decorator to require specific roles within the domain's database
    
    Args:
        allowed_roles: List of allowed roles (e.g., ['admin', 'recruiter'])
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # First check domain authentication
            auth_result = require_domain_auth(lambda: None)()
            if auth_result is not None:
                return auth_result
            
            # Check role in domain-specific database
            user = getattr(request, 'current_user', None)
            if not user:
                return jsonify({
                    'status': 'error',
                    'message': 'User not authenticated'
                }), 401
            
            if user.role not in allowed_roles:
                logger.warning(f"User {user.username} with role {user.role} denied access to endpoint requiring {allowed_roles}")
                return jsonify({
                    'status': 'error',
                    'message': 'Insufficient permissions for this domain'
                }), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def require_domain_admin(f):
    """Decorator to require admin role in domain-specific database"""
    return require_domain_role(['admin'])(f)

def require_domain_recruiter(f):
    """Decorator to require recruiter role in domain-specific database"""
    return require_domain_role(['recruiter'])(f)

def require_domain_admin_or_recruiter(f):
    """Decorator to require either admin or recruiter role in domain-specific database"""
    return require_domain_role(['admin', 'recruiter'])(f)

def validate_domain_access(username: str, domain: str) -> bool:
    """
    Validate that a user has access to a specific domain
    
    Args:
        username: Username to validate
        domain: Domain identifier
        
    Returns:
        True if user has access to domain, False otherwise
    """
    try:
        # Ensure domain database isolation
        if not database_manager.ensure_domain_database_isolation():
            logger.error(f"Failed to ensure domain database isolation for: {domain}")
            return False
        
        # Validate user belongs to domain
        return database_manager.validate_user_belongs_to_domain(username, domain)
        
    except Exception as e:
        logger.error(f"Error validating domain access for user {username} in domain {domain}: {str(e)}")
        return False

def get_current_domain_user():
    """
    Get the current authenticated user from the domain-specific database
    
    Returns:
        User object or None if not authenticated
    """
    return getattr(request, 'current_user', None)

def get_current_domain():
    """
    Get the current domain from the request
    
    Returns:
        Domain string or None if not available
    """
    return getattr(request, 'current_domain', None)

def ensure_domain_isolation():
    """
    Ensure the current request is using the correct database for its domain
    
    Returns:
        True if domain isolation is properly set up, False otherwise
    """
    try:
        domain = database_manager.get_domain_from_request()
        if not domain:
            logger.error("Could not determine domain from request")
            return False
        
        return database_manager.ensure_domain_database_isolation()
        
    except Exception as e:
        logger.error(f"Error ensuring domain isolation: {str(e)}")
        return False
