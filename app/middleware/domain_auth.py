import logging
from functools import wraps
from types import SimpleNamespace
from flask import request, jsonify, current_app, g
from flask_jwt_extended import jwt_required, get_jwt_identity, decode_token, get_jwt
from app.services.database_manager import database_manager
from app.models.user import User

logger = logging.getLogger(__name__)

class EnumWrapper:
    """
    Wrapper class to mimic enum behavior for backward compatibility.
    Allows both user.role and user.role.value to work with string values from JWT.
    """
    def __init__(self, value):
        self._value = value
    
    @property
    def value(self):
        """Return the string value (mimics enum.value)"""
        return self._value
    
    def __str__(self):
        """Return string representation"""
        return self._value
    
    def __eq__(self, other):
        """Allow comparison with strings and other EnumWrappers"""
        if isinstance(other, str):
            return self._value == other
        if isinstance(other, EnumWrapper):
            return self._value == other._value
        return False
    
    def __ne__(self, other):
        """Not equal comparison"""
        return not self.__eq__(other)
    
    def __repr__(self):
        """Return representation for debugging"""
        return f"EnumWrapper('{self._value}')"
    
    def __hash__(self):
        """Make hashable for use in sets/dicts"""
        return hash(self._value)

def extract_user_from_jwt_token(token: str = None) -> SimpleNamespace:
    """
    Extract user information from JWT token and create a lightweight user object.
    
    This is a STATELESS operation - no database queries are performed.
    
    Args:
        token: JWT token string (optional, will extract from Authorization header if not provided)
        
    Returns:
        SimpleNamespace object with user attributes (username, role, domain, etc.)
        
    Raises:
        Exception: If token is invalid or cannot be decoded
    """
    try:
        # If token not provided, extract from Authorization header
        if not token:
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                raise ValueError("Invalid Authorization header format")
            token = auth_header.split(' ')[1].strip()
        
        # Decode JWT token and extract claims
        token_data = decode_token(token)
        username = token_data.get('sub') or token_data.get('identity')
        domain = token_data.get('domain')
        role = token_data.get('role')
        user_id = token_data.get('user_id')
        email = token_data.get('email')
        full_name = token_data.get('full_name')
        
        if not username:
            raise ValueError("No username found in JWT token")
        
        # Create lightweight user object from JWT claims
        user = SimpleNamespace(
            username=username,
            role=EnumWrapper(role) if role else None,  # Wrap role for backward compatibility
            user_id=user_id,
            email=email,
            full_name=full_name,
            domain=domain
        )
        
        logger.debug(f"Extracted user {username} from JWT (stateless)")
        return user
        
    except Exception as e:
        logger.error(f"Failed to extract user from JWT token: {str(e)}")
        raise

def extract_user_from_jwt_claims() -> SimpleNamespace:
    """
    Extract user information from JWT claims (when using @jwt_required() decorator).
    
    This is a STATELESS operation - no database queries are performed.
    Use this function when you've already applied @jwt_required() decorator.
    
    Returns:
        SimpleNamespace object with user attributes
        
    Raises:
        Exception: If JWT claims cannot be accessed
    """
    try:
        # Get username from JWT identity
        username = get_jwt_identity()
        if not username:
            raise ValueError("No username in JWT identity")
        
        # Get additional claims
        jwt_claims = get_jwt()
        domain = jwt_claims.get('domain')
        role = jwt_claims.get('role')
        user_id = jwt_claims.get('user_id')
        email = jwt_claims.get('email')
        full_name = jwt_claims.get('full_name')
        
        # Create lightweight user object
        user = SimpleNamespace(
            username=username,
            role=EnumWrapper(role) if role else None,  # Wrap role for backward compatibility
            user_id=user_id,
            email=email,
            full_name=full_name,
            domain=domain
        )
        
        logger.debug(f"Extracted user {username} from JWT claims (stateless)")
        return user
        
    except Exception as e:
        logger.error(f"Failed to extract user from JWT claims: {str(e)}")
        raise

def require_domain_auth(f):
    """
    Decorator to require domain-specific authentication with STATELESS JWT validation
    
    This decorator ensures that:
    1. JWT token is valid (signature + expiry)
    2. User info is extracted from JWT claims (NO database query)
    3. Domain-specific database session is established for business logic
    4. Cross-database access is prevented via domain validation
    
    NOTE: Authentication is now STATELESS - no DB queries for user validation.
    This prevents JWT validation failures when database connections are recycled.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            # Get domain from custom header or fallback to detection
            domain = request.headers.get('X-Original-Domain')
            if not domain:
                domain = request.headers.get('X-Domain')
            if not domain:
                domain = database_manager.get_domain_from_request()
            
            if not domain:
                logger.error("Could not determine domain from request")
                return jsonify({
                    'status': 'error',
                    'message': 'Could not determine domain from request'
                }), 400
            
            # Get authorization header
            auth_header = request.headers.get('Authorization')
            if not auth_header:
                logger.error(f"No Authorization header in request to {request.path}")
                return jsonify({
                    'status': 'error',
                    'message': 'Authorization header required'
                }), 401
            
            # Extract token from Authorization header
            # Format: "Bearer <JWT_TOKEN>"
            parts = auth_header.split(' ')
            if len(parts) != 2 or parts[0] != 'Bearer':
                return jsonify({
                    'status': 'error',
                    'message': 'Invalid authorization format'
                }), 401
            
            token = parts[1].strip()
            
            # Decode JWT token and extract ALL claims (STATELESS - no DB query)
            try:
                token_data = decode_token(token)
                username = token_data.get('sub') or token_data.get('identity')
                token_domain = token_data.get('domain')
                role = token_data.get('role')
                user_id = token_data.get('user_id')
                email = token_data.get('email')
                full_name = token_data.get('full_name')
                
                if not username:
                    logger.error("No username found in JWT token")
                    return jsonify({
                        'status': 'error',
                        'message': 'Invalid token format'
                    }), 401
                    
            except Exception as token_error:
                logger.error(f"Failed to decode JWT token: {str(token_error)}")
                return jsonify({
                    'status': 'error',
                    'message': 'Invalid or expired token'
                }), 401
            
            # Validate domain in JWT matches request domain
            # This prevents cross-domain token usage
            if token_domain and token_domain != domain:
                logger.warning(f"Domain mismatch: JWT has '{token_domain}', request has '{domain}'")
                return jsonify({
                    'status': 'error',
                    'message': 'Token not valid for this domain'
                }), 401
            
            # Create lightweight user object from JWT claims (NO database query)
            # This makes authentication STATELESS and independent of DB connection health
            from types import SimpleNamespace
            request.current_user = SimpleNamespace(
                username=username,
                role=EnumWrapper(role) if role else None,  # Wrap role for backward compatibility
                user_id=user_id,
                email=email,
                full_name=full_name,
                domain=token_domain or domain
            )
            request.current_domain = domain
            
            # Establish domain database session for business logic (not for auth)
            # This is optional - only needed if the endpoint requires DB queries
            try:
                database_manager.ensure_domain_database_isolation()
            except Exception as db_error:
                # Log warning but don't fail authentication
                # Some endpoints may not need database access
                logger.warning(f"Could not establish DB session for domain {domain}: {str(db_error)}")
                # Don't return error here - let the endpoint decide if DB is needed
            
            logger.info(f"User {username} authenticated via JWT for domain {domain} (stateless)")
            return f(*args, **kwargs)
                
        except Exception as e:
            logger.error(f"Error in require_domain_auth decorator: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': 'Authentication system error'
            }), 500
    
    return decorated_function

def require_jwt_domain_auth(f):
    """
    Decorator to require JWT authentication with STATELESS validation
    
    This decorator uses Flask-JWT-Extended's @jwt_required() decorator
    combined with stateless user info extraction from JWT claims.
    
    This decorator ensures that:
    1. Valid JWT token is provided (via @jwt_required())
    2. User info is extracted from JWT claims (NO database query)
    3. Domain-specific database session is established for business logic
    4. Cross-database access is prevented via domain validation
    
    NOTE: Authentication is now STATELESS - no DB queries for user validation.
    """
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        try:
            # Get username from JWT token (validated by @jwt_required())
            username = get_jwt_identity()
            if not username:
                return jsonify({
                    'status': 'error',
                    'message': 'Invalid JWT token'
                }), 401
            
            # Get additional claims from JWT token (STATELESS - no DB query)
            from flask_jwt_extended import get_jwt
            jwt_claims = get_jwt()
            token_domain = jwt_claims.get('domain')
            role = jwt_claims.get('role')
            user_id = jwt_claims.get('user_id')
            email = jwt_claims.get('email')
            full_name = jwt_claims.get('full_name')
            
            # Get domain from custom header or fallback to detection
            domain = request.headers.get('X-Original-Domain')
            if not domain:
                domain = request.headers.get('X-Domain')
            if not domain:
                domain = database_manager.get_domain_from_request()
            
            if not domain:
                logger.error("Could not determine domain from request")
                return jsonify({
                    'status': 'error',
                    'message': 'Could not determine domain from request'
                }), 400
            
            # Validate domain in JWT matches request domain
            if token_domain and token_domain != domain:
                logger.warning(f"Domain mismatch: JWT has '{token_domain}', request has '{domain}'")
                return jsonify({
                    'status': 'error',
                    'message': 'Token not valid for this domain'
                }), 401
            
            # Create lightweight user object from JWT claims (NO database query)
            from types import SimpleNamespace
            request.current_user = SimpleNamespace(
                username=username,
                role=EnumWrapper(role) if role else None,  # Wrap role for backward compatibility
                user_id=user_id,
                email=email,
                full_name=full_name,
                domain=token_domain or domain
            )
            request.current_domain = domain
            
            # Establish domain database session for business logic (not for auth)
            try:
                database_manager.ensure_domain_database_isolation()
            except Exception as db_error:
                # Log warning but don't fail authentication
                logger.warning(f"Could not establish DB session for domain {domain}: {str(db_error)}")
            
            logger.info(f"User {username} authenticated via JWT for domain {domain} (stateless)")
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
