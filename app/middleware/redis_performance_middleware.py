import logging
import hashlib
import json
import time
from functools import wraps
from flask import request, jsonify, current_app, g
from app.services.redis_service import redis_cache_service, redis_service

logger = logging.getLogger(__name__)

class RedisPerformanceMiddleware:
    """Redis-based performance optimization middleware"""
    
    def __init__(self):
        self.cacheable_endpoints = {
            'GET': [
                '/api/profiles',
                '/api/requirements',
                '/api/skills',
                '/api/trackers',
                '/api/sla-configs',
                '/api/workflow-progress',
                '/api/notifications',
                '/api/user',
                '/api/status-tracker'
            ],
            'POST': [],  # Generally don't cache POST requests
            'PUT': [],   # Generally don't cache PUT requests
            'DELETE': [] # Generally don't cache DELETE requests
        }
        
        self.cache_ttl_map = {
            '/api/profiles': 1800,      # 30 minutes
            '/api/requirements': 3600,   # 1 hour
            '/api/skills': 7200,        # 2 hours
            '/api/trackers': 900,       # 15 minutes
            '/api/sla-configs': 3600,   # 1 hour
            '/api/workflow-progress': 300,  # 5 minutes
            '/api/notifications': 60,   # 1 minute
            '/api/user': 1800,          # 30 minutes
            '/api/status-tracker': 300  # 5 minutes
        }
    
    def cache_response(self, ttl: int = None, key_prefix: str = None):
        """
        Decorator to cache API responses in Redis
        
        Args:
            ttl: Time to live in seconds (overrides endpoint-specific TTL)
            key_prefix: Custom cache key prefix
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Only cache if Redis is available
                if not redis_service.is_available():
                    return f(*args, **kwargs)
                
                # Generate cache key
                cache_key = self._generate_cache_key(f, request, key_prefix)
                
                # Check if response is cached
                cached_response = redis_cache_service.get_cached_api_response(
                    request.path, 
                    self._extract_request_params()
                )
                
                if cached_response:
                    logger.debug(f"Cache hit for {request.path}")
                    
                    # Add cache headers
                    response = jsonify(cached_response)
                    response.headers['X-Cache'] = 'HIT'
                    response.headers['X-Cache-Key'] = cache_key
                    return response
                
                # Execute original function
                start_time = time.time()
                response = f(*args, **kwargs)
                execution_time = time.time() - start_time
                
                # Cache successful responses
                if (hasattr(response, 'status_code') and 
                    response.status_code == 200 and 
                    self._should_cache_response(request)):
                    
                    try:
                        # Extract response data
                        response_data = self._extract_response_data(response)
                        
                        if response_data:
                            # Determine TTL
                            cache_ttl = ttl or self.cache_ttl_map.get(request.path, 3600)
                            
                            # Cache the response
                            success = redis_cache_service.cache_api_response(
                                request.path,
                                self._extract_request_params(),
                                response_data,
                                cache_ttl
                            )
                            
                            if success:
                                logger.debug(f"Cached response for {request.path} (TTL: {cache_ttl}s)")
                                
                                # Add cache headers
                                if hasattr(response, 'headers'):
                                    response.headers['X-Cache'] = 'MISS'
                                    response.headers['X-Cache-Key'] = cache_key
                                    response.headers['X-Cache-TTL'] = str(cache_ttl)
                                    response.headers['X-Execution-Time'] = f"{execution_time:.3f}s"
                    
                    except Exception as e:
                        logger.error(f"Error caching response for {request.path}: {str(e)}")
                
                return response
            
            return decorated_function
        return decorator
    
    def cache_database_query(self, ttl: int = 3600, key_prefix: str = None):
        """
        Decorator to cache database query results
        
        Args:
            ttl: Time to live in seconds
            key_prefix: Custom cache key prefix
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Only cache if Redis is available
                if not redis_service.is_available():
                    return f(*args, **kwargs)
                
                # Generate cache key for the query
                cache_key = self._generate_query_cache_key(f, args, kwargs, key_prefix)
                
                # Check cache
                cached_result = redis_service.get(cache_key)
                if cached_result is not None:
                    logger.debug(f"Database query cache hit: {f.__name__}")
                    return cached_result
                
                # Execute query
                result = f(*args, **kwargs)
                
                # Cache result
                if result is not None:
                    redis_service.set(cache_key, result, ttl)
                    logger.debug(f"Cached database query result: {f.__name__}")
                
                return result
            
            return decorated_function
        return decorator
    
    def invalidate_cache_pattern(self, pattern: str):
        """
        Decorator to invalidate cache entries matching a pattern
        
        Args:
            pattern: Cache key pattern to invalidate
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Execute original function
                result = f(*args, **kwargs)
                
                # Invalidate cache if Redis is available
                if redis_service.is_available():
                    try:
                        cleared_count = redis_service.clear_pattern(pattern)
                        logger.debug(f"Invalidated {cleared_count} cache entries matching pattern: {pattern}")
                    except Exception as e:
                        logger.error(f"Error invalidating cache pattern {pattern}: {str(e)}")
                
                return result
            
            return decorated_function
        return decorator
    
    def rate_limit(self, requests_per_minute: int = 60, key_func=None):
        """
        Decorator to add rate limiting to endpoints
        
        Args:
            requests_per_minute: Maximum requests per minute
            key_func: Function to generate rate limit key (defaults to IP address)
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Only apply rate limiting if Redis is available
                if not redis_service.is_available():
                    return f(*args, **kwargs)
                
                # Generate rate limit key
                if key_func:
                    rate_limit_key = key_func(request)
                else:
                    rate_limit_key = f"{request.remote_addr}:{request.path}"
                
                # Check rate limit
                rate_limit_result = redis_cache_service.rate_limit_check(
                    rate_limit_key,
                    requests_per_minute,
                    60  # 1 minute window
                )
                
                if not rate_limit_result['allowed']:
                    logger.warning(f"Rate limit exceeded for {rate_limit_key}")
                    return jsonify({
                        'status': 'error',
                        'message': 'Rate limit exceeded',
                        'reset_time': rate_limit_result['reset_time'],
                        'remaining': rate_limit_result['remaining']
                    }), 429
                
                # Add rate limit headers
                response = f(*args, **kwargs)
                if hasattr(response, 'headers'):
                    response.headers['X-RateLimit-Limit'] = str(requests_per_minute)
                    response.headers['X-RateLimit-Remaining'] = str(rate_limit_result['remaining'])
                    response.headers['X-RateLimit-Reset'] = str(rate_limit_result['reset_time'])
                
                return response
            
            return decorated_function
        return decorator
    
    def _generate_cache_key(self, func, request, key_prefix=None):
        """Generate cache key for API response"""
        prefix = key_prefix or f"api_cache:{func.__name__}"
        
        # Include path, method, and query parameters
        key_data = {
            'path': request.path,
            'method': request.method,
            'args': dict(request.args),
            'domain': request.headers.get('X-Original-Domain', 'default')
        }
        
        # Create hash of key data
        key_string = json.dumps(key_data, sort_keys=True)
        key_hash = hashlib.md5(key_string.encode()).hexdigest()
        
        return f"{prefix}:{key_hash}"
    
    def _generate_query_cache_key(self, func, args, kwargs, key_prefix=None):
        """Generate cache key for database query"""
        prefix = key_prefix or f"db_query:{func.__name__}"
        
        # Create hash of function arguments
        key_data = {
            'args': str(args),
            'kwargs': str(sorted(kwargs.items())) if kwargs else ''
        }
        
        key_string = json.dumps(key_data, sort_keys=True)
        key_hash = hashlib.md5(key_string.encode()).hexdigest()
        
        return f"{prefix}:{key_hash}"
    
    def _extract_request_params(self):
        """Extract request parameters for caching"""
        # Include domain, query/body, and a hashed auth token so caches are user-specific
        auth_header = request.headers.get('Authorization') or ''
        try:
            auth_hash = hashlib.md5(auth_header.encode()).hexdigest() if auth_header else None
        except Exception:
            auth_hash = None
        params = {
            'args': dict(request.args),
            'json': request.get_json(silent=True) if request.is_json else None,
            'domain': request.headers.get('X-Original-Domain', 'default'),
            'auth': auth_hash
        }
        return params
    
    def _extract_response_data(self, response):
        """Extract data from response for caching"""
        try:
            if hasattr(response, 'get_json'):
                return response.get_json(silent=True)
            elif hasattr(response, 'data'):
                return json.loads(response.data.decode('utf-8'))
            else:
                return None
        except Exception as e:
            logger.error(f"Error extracting response data: {str(e)}")
            return None
    
    def _should_cache_response(self, request):
        """Determine if response should be cached"""
        # Only cache GET requests
        if request.method != 'GET':
            return False
        
        # Check if endpoint is cacheable
        cacheable_paths = self.cacheable_endpoints.get(request.method, [])
        for path in cacheable_paths:
            if request.path.startswith(path):
                return True
        
        return False
    
    def get_cache_stats(self):
        """Get cache statistics"""
        if not redis_service.is_available():
            return {'redis_available': False}
        
        try:
            # Get API cache stats
            api_cache_pattern = f"{current_app.config.get('REDIS_API_CACHE_PREFIX', 'api_cache:')}*"
            api_cache_keys = redis_service.get_keys_by_pattern(api_cache_pattern)
            
            # Get query cache stats
            query_cache_pattern = "db_query:*"
            query_cache_keys = redis_service.get_keys_by_pattern(query_cache_pattern)
            
            return {
                'redis_available': True,
                'api_cache_entries': len(api_cache_keys),
                'query_cache_entries': len(query_cache_keys),
                'total_cache_entries': len(api_cache_keys) + len(query_cache_keys),
                'cacheable_endpoints': self.cacheable_endpoints['GET']
            }
        except Exception as e:
            logger.error(f"Error getting cache stats: {str(e)}")
            return {'redis_available': False, 'error': str(e)}
    
    def clear_all_caches(self):
        """Clear all performance caches"""
        if not redis_service.is_available():
            return False
        
        try:
            # Clear API caches
            api_cache_pattern = f"{current_app.config.get('REDIS_API_CACHE_PREFIX', 'api_cache:')}*"
            api_cleared = redis_service.clear_pattern(api_cache_pattern)
            
            # Clear query caches
            query_cache_pattern = "db_query:*"
            query_cleared = redis_service.clear_pattern(query_cache_pattern)
            
            logger.info(f"Cleared {api_cleared} API cache entries and {query_cleared} query cache entries")
            return True
        except Exception as e:
            logger.error(f"Error clearing caches: {str(e)}")
            return False

# Global performance middleware instance
redis_performance_middleware = RedisPerformanceMiddleware()

# Convenience decorators
def cache_response(ttl=None, key_prefix=None):
    """Decorator to cache API responses"""
    return redis_performance_middleware.cache_response(ttl, key_prefix)

def cache_database_query(ttl=3600, key_prefix=None):
    """Decorator to cache database query results"""
    return redis_performance_middleware.cache_database_query(ttl, key_prefix)

def invalidate_cache_pattern(pattern):
    """Decorator to invalidate cache entries"""
    return redis_performance_middleware.invalidate_cache_pattern(pattern)

def rate_limit(requests_per_minute=60, key_func=None):
    """Decorator to add rate limiting"""
    return redis_performance_middleware.rate_limit(requests_per_minute, key_func)


