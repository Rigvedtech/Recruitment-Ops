from functools import wraps
from flask import request, jsonify, current_app, g
from app.models.user import User
from app.database import db

def get_db_session():
    """
    Get the correct database session for the current domain.
    Returns domain-specific session if available, otherwise falls back to global session.
    """
    try:
        # Check if we have a domain-specific session
        if hasattr(g, 'db_session') and g.db_session is not None:
            # Verify it's a valid session object
            if hasattr(g.db_session, 'query'):
                return g.db_session
        
        # Fallback to global session
        return db.session
    except Exception as e:
        current_app.logger.error(f"Error in get_db_session: {str(e)}")
        return db.session

def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get user from request headers or session
        # For now, we'll use a simple approach with username in headers
        # In production, you should use JWT tokens or session-based auth
        
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authorization header required'}), 401
        
        try:
            # Extract username from Authorization header
            # Format: "Bearer username"
            parts = auth_header.split(' ')
            if len(parts) != 2 or parts[0] != 'Bearer':
                return jsonify({'error': 'Invalid authorization format'}), 401
            
            username = parts[1]
            
            # Get session and find user
            session = get_db_session()
            user = session.query(User).filter_by(username=username).first()
            
            if not user:
                return jsonify({'error': 'User not found'}), 401
            
            # Add user to request context
            request.current_user = user
            
            return f(*args, **kwargs)
            
        except Exception as e:
            current_app.logger.error(f"Authentication error: {str(e)}")
            return jsonify({'error': 'Authentication failed'}), 401
    
    return decorated_function

def require_role(allowed_roles):
    """Decorator to require specific roles"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # First check authentication
            auth_result = require_auth(lambda: None)()
            if auth_result is not None:
                return auth_result
            
            # Check role
            user = getattr(request, 'current_user', None)
            if not user:
                return jsonify({'error': 'User not authenticated'}), 401
            
            if user.role not in allowed_roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def require_admin(f):
    """Decorator to require admin role"""
    return require_role(['admin'])(f)

def require_recruiter(f):
    """Decorator to require recruiter role"""
    return require_role(['recruiter'])(f)

def require_admin_or_recruiter(f):
    """Decorator to require either admin or recruiter role"""
    return require_role(['admin', 'recruiter'])(f) 