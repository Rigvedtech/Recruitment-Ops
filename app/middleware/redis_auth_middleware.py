import logging
import time
from functools import wraps
from typing import Optional
from flask import request, jsonify, current_app, g
from flask_jwt_extended import jwt_required, get_jwt_identity, decode_token
from app.services.redis_service import redis_session_service, redis_cache_service
from app.services.database_manager import database_manager
from app.models.user import User

logger = logging.getLogger(__name__)

class RedisAuthMiddleware:
    """Enhanced authentication middleware with Redis session management"""
    
    def __init__(self):
        self.rate_limit_cache = {}
    
    def require_redis_domain_auth(self, f):
        """
        Decorator to require domain-specific authentication with Redis session management
        
        This decorator provides:
        1. Redis-based session caching
        2. Rate limiting protection
        3. Domain-specific database isolation
        4. Enhanced performance through caching
        """
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                # Get domain from request headers
                domain = self._extract_domain_from_request()
                if not domain:
                    return jsonify({
                        'status': 'error',
                        'message': 'Could not determine domain from request'
                    }), 400
                
                # Check rate limiting
                rate_limit_result = self._check_rate_limit(request.remote_addr, domain)
                if not rate_limit_result['allowed']:
                    return jsonify({
                        'status': 'error',
                        'message': 'Rate limit exceeded',
                        'reset_time': rate_limit_result['reset_time']
                    }), 429
                
                # Get authentication token
                auth_token = self._extract_auth_token()
                if not auth_token:
                    return jsonify({
                        'status': 'error',
                        'message': 'Authorization token required'
                    }), 401
                
                # Validate and decode token
                token_data = self._validate_token(auth_token)
                if not token_data:
                    return jsonify({
                        'status': 'error',
                        'message': 'Invalid or expired token'
                    }), 401
                
                username = token_data.get('sub') or token_data.get('identity')
                if not username:
                    return jsonify({
                        'status': 'error',
                        'message': 'Invalid token format'
                    }), 401
                
                # Check Redis session cache first
                user_session = self._get_cached_user_session(username, domain)
                if user_session:
                    # Update session access time
                    redis_session_service.update_session(
                        user_session['session_id'], 
                        domain, 
                        {'last_accessed': time.time()}
                    )
                    
                    # Set request context
                    request.current_user = user_session['user_data']
                    request.current_domain = domain
                    request.session_id = user_session['session_id']
                    
                    logger.info(f"User {username} authenticated via Redis cache for domain {domain}")
                    return f(*args, **kwargs)
                
                # Fallback to database validation
                if not self._ensure_domain_database_isolation(domain):
                    return jsonify({
                        'status': 'error',
                        'message': 'Database not available for this domain'
                    }), 503
                
                # Validate user in domain-specific database
                user = self._validate_user_in_domain(username, domain)
                if not user:
                    return jsonify({
                        'status': 'error',
                        'message': 'User not found in this domain'
                    }), 401
                
                # Create new session in Redis
                session_data = {
                    'user_id': user.id,
                    'username': user.username,
                    'role': user.role,
                    'domain': domain,
                    'authenticated_at': time.time()
                }
                
                session_id = redis_session_service.create_session(
                    str(user.id), 
                    domain, 
                    session_data
                )
                
                if session_id:
                    # Set request context
                    request.current_user = user
                    request.current_domain = domain
                    request.session_id = session_id
                    
                    logger.info(f"User {username} authenticated and session cached for domain {domain}")
                    return f(*args, **kwargs)
                else:
                    # Fallback if Redis session creation fails
                    request.current_user = user
                    request.current_domain = domain
                    
                    logger.warning(f"Redis session creation failed for user {username}, using fallback")
                    return f(*args, **kwargs)
                
            except Exception as e:
                logger.error(f"Error in Redis domain authentication: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': 'Authentication system error'
                }), 500
        
        return decorated_function
    
    def require_jwt_redis_domain_auth(self, f):
        """
        Decorator to require JWT authentication with Redis session management
        
        This decorator provides:
        1. JWT token validation
        2. Redis session caching
        3. Domain-specific database isolation
        4. Enhanced performance through caching
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
                
                # Get domain from request headers
                domain = self._extract_domain_from_request()
                if not domain:
                    return jsonify({
                        'status': 'error',
                        'message': 'Could not determine domain from request'
                    }), 400
                
                # Check Redis session cache first
                user_session = self._get_cached_user_session(username, domain)
                if user_session:
                    # Update session access time
                    redis_session_service.update_session(
                        user_session['session_id'], 
                        domain, 
                        {'last_accessed': time.time()}
                    )
                    
                    # Set request context
                    request.current_user = user_session['user_data']
                    request.current_domain = domain
                    request.session_id = user_session['session_id']
                    
                    logger.info(f"User {username} authenticated via JWT+Redis cache for domain {domain}")
                    return f(*args, **kwargs)
                
                # Fallback to database validation
                if not self._ensure_domain_database_isolation(domain):
                    return jsonify({
                        'status': 'error',
                        'message': 'Database not available for this domain'
                    }), 503
                
                # Validate user in domain-specific database
                user = self._validate_user_in_domain(username, domain)
                if not user:
                    return jsonify({
                        'status': 'error',
                        'message': 'User not found in this domain'
                    }), 401
                
                # Create new session in Redis
                session_data = {
                    'user_id': user.id,
                    'username': user.username,
                    'role': user.role,
                    'domain': domain,
                    'authenticated_at': time.time(),
                    'auth_method': 'jwt'
                }
                
                session_id = redis_session_service.create_session(
                    str(user.id), 
                    domain, 
                    session_data
                )
                
                if session_id:
                    # Set request context
                    request.current_user = user
                    request.current_domain = domain
                    request.session_id = session_id
                    
                    logger.info(f"User {username} authenticated via JWT and session cached for domain {domain}")
                    return f(*args, **kwargs)
                else:
                    # Fallback if Redis session creation fails
                    request.current_user = user
                    request.current_domain = domain
                    
                    logger.warning(f"Redis session creation failed for user {username}, using fallback")
                    return f(*args, **kwargs)
                
            except Exception as e:
                logger.error(f"Error in JWT Redis domain authentication: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': 'Authentication system error'
                }), 500
        
        return decorated_function
    
    def require_redis_domain_role(self, allowed_roles):
        """
        Decorator to require specific roles within the domain's database with Redis caching
        
        Args:
            allowed_roles: List of allowed roles (e.g., ['admin', 'recruiter'])
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # First check Redis domain authentication
                auth_result = self.require_redis_domain_auth(lambda: None)()
                if auth_result is not None:
                    return auth_result
                
                # Check role in cached user data
                user = getattr(request, 'current_user', None)
                if not user:
                    return jsonify({
                        'status': 'error',
                        'message': 'User not authenticated'
                    }), 401
                
                # Handle both User objects and session data
                user_role = user.role if hasattr(user, 'role') else user.get('role')
                if user_role not in allowed_roles:
                    logger.warning(f"User {user.username if hasattr(user, 'username') else user.get('username')} "
                                 f"with role {user_role} denied access to endpoint requiring {allowed_roles}")
                    return jsonify({
                        'status': 'error',
                        'message': 'Insufficient permissions for this domain'
                    }), 403
                
                return f(*args, **kwargs)
            return decorated_function
        return decorator
    
    def _extract_domain_from_request(self) -> str:
        """Extract domain from request headers"""
        domain = request.headers.get('X-Original-Domain')
        if not domain:
            domain = request.headers.get('X-Domain')
        if not domain:
            domain = database_manager.get_domain_from_request()
        return domain
    
    def _extract_auth_token(self) -> str:
        """Extract authentication token from request headers"""
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return None
        
        try:
            parts = auth_header.split(' ')
            if len(parts) != 2 or parts[0] != 'Bearer':
                return None
            return parts[1].strip()
        except Exception:
            return None
    
    def _validate_token(self, token: str) -> dict:
        """Validate and decode authentication token"""
        try:
            # Try to decode as JWT token
            token_data = decode_token(token)
            return token_data
        except Exception as e:
            logger.debug(f"Token validation failed: {str(e)}")
            return None
    
    def _get_cached_user_session(self, username: str, domain: str) -> Optional[dict]:
        """Get cached user session from Redis"""
        try:
            # Try to find session by username
            session_info = redis_session_service.get_session_by_username(username, domain)
            if session_info:
                return session_info
            return None
        except Exception as e:
            logger.error(f"Error getting cached user session for {username}: {str(e)}")
            return None
    
    def _ensure_domain_database_isolation(self, domain: str) -> bool:
        """Ensure domain database isolation is properly set up"""
        try:
            return database_manager.ensure_domain_database_isolation()
        except Exception as e:
            logger.error(f"Error ensuring domain database isolation: {str(e)}")
            return False
    
    def _validate_user_in_domain(self, username: str, domain: str) -> Optional[User]:
        """Validate user exists in domain-specific database"""
        try:
            # Ensure domain database isolation
            if not database_manager.switch_to_domain_database(domain):
                logger.error(f"Could not switch to database for domain: {domain}")
                return None
            
            # Check if user exists in the domain's database
            if not hasattr(g, 'db_session') or g.db_session is None:
                logger.error("No database session available for user validation")
                return None
            
            # Query user in domain-specific database
            user = g.db_session.query(User).filter_by(username=username).first()
            
            if user:
                logger.info(f"User {username} found in domain {domain} database")
                return user
            else:
                logger.warning(f"User {username} not found in domain {domain} database")
                return None
                
        except Exception as e:
            logger.error(f"Error validating user {username} for domain {domain}: {str(e)}")
            return None
    
    def _check_rate_limit(self, identifier: str, domain: str) -> dict:
        """Check rate limit for identifier and domain"""
        try:
            # Use domain-specific rate limiting
            rate_limit_key = f"{domain}:{identifier}"
            limit = current_app.config.get('RATE_LIMIT_PER_MINUTE', 100)
            window = 60  # 1 minute
            
            return redis_cache_service.rate_limit_check(rate_limit_key, limit, window)
        except Exception as e:
            logger.error(f"Error checking rate limit: {str(e)}")
            return {'allowed': True, 'remaining': 100, 'reset_time': 0}

# Convenience decorators
def require_redis_domain_auth(f):
    """Decorator to require Redis-based domain authentication"""
    middleware = RedisAuthMiddleware()
    return middleware.require_redis_domain_auth(f)

def require_jwt_redis_domain_auth(f):
    """Decorator to require JWT-based Redis domain authentication"""
    middleware = RedisAuthMiddleware()
    return middleware.require_jwt_redis_domain_auth(f)

def require_redis_domain_role(allowed_roles):
    """Decorator to require Redis-based domain role authentication"""
    middleware = RedisAuthMiddleware()
    return middleware.require_redis_domain_role(allowed_roles)

def require_redis_domain_admin(f):
    """Decorator to require admin role with Redis authentication"""
    return require_redis_domain_role(['admin'])(f)

def require_redis_domain_recruiter(f):
    """Decorator to require recruiter role with Redis authentication"""
    return require_redis_domain_role(['recruiter'])(f)

def require_redis_domain_admin_or_recruiter(f):
    """Decorator to require either admin or recruiter role with Redis authentication"""
    return require_redis_domain_role(['admin', 'recruiter'])(f)

# Session management utilities
def get_current_redis_session():
    """Get the current Redis session ID from request"""
    return getattr(request, 'session_id', None)

def invalidate_current_session():
    """Invalidate the current user session"""
    session_id = get_current_redis_session()
    domain = getattr(request, 'current_domain', None)
    
    if session_id and domain:
        return redis_session_service.destroy_session(session_id, domain)
    return False

def invalidate_user_sessions(username: str, domain: str):
    """Invalidate all sessions for a user in a domain"""
    return redis_session_service.destroy_user_sessions(username, domain)
