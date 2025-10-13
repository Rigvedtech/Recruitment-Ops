import logging
import json
import time
import hashlib
from typing import Dict, Optional, Any, Union
from flask import current_app
import redis
from redis.connection import ConnectionPool
from contextlib import contextmanager

logger = logging.getLogger(__name__)

class RedisService:
    """Redis service for caching, session management, and performance optimization"""
    
    def __init__(self, app=None):
        self.redis_client = None
        self.connection_pool = None
        self.app = app
        
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize Redis service with Flask app"""
        self.app = app
        
        try:
            # Create connection pool
            self.connection_pool = ConnectionPool(
                host=app.config.get('REDIS_HOST', 'localhost'),
                port=app.config.get('REDIS_PORT', 6379),
                password=app.config.get('REDIS_PASSWORD'),
                db=app.config.get('REDIS_DB', 0),
                max_connections=app.config.get('REDIS_MAX_CONNECTIONS', 50),
                retry_on_timeout=True,
                socket_keepalive=True,
                socket_keepalive_options={}
            )
            
            # Create Redis client
            self.redis_client = redis.Redis(
                connection_pool=self.connection_pool,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            
            # Test connection
            self.redis_client.ping()
            logger.info("Redis service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Redis service: {str(e)}")
            self.redis_client = None
            self.connection_pool = None
    
    @contextmanager
    def get_redis_client(self):
        """Context manager for Redis client with error handling"""
        if not self.redis_client:
            logger.warning("Redis client not available, falling back to no-op")
            yield None
            return
        
        try:
            yield self.redis_client
        except redis.RedisError as e:
            logger.error(f"Redis error: {str(e)}")
            yield None
        except Exception as e:
            logger.error(f"Unexpected error with Redis: {str(e)}")
            yield None
    
    def is_available(self) -> bool:
        """Check if Redis service is available"""
        if not self.redis_client:
            return False
        
        try:
            self.redis_client.ping()
            return True
        except Exception:
            return False
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from Redis cache"""
        with self.get_redis_client() as client:
            if not client:
                return None
            
            try:
                value = client.get(key)
                if value:
                    # Try to deserialize JSON, fallback to string
                    try:
                        return json.loads(value)
                    except (json.JSONDecodeError, TypeError):
                        return value
                return None
            except Exception as e:
                logger.error(f"Error getting key {key} from Redis: {str(e)}")
                return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in Redis cache"""
        with self.get_redis_client() as client:
            if not client:
                return False
            
            try:
                # Serialize value to JSON if it's not a string
                if not isinstance(value, str):
                    value = json.dumps(value)
                
                if ttl:
                    client.setex(key, ttl, value)
                else:
                    client.set(key, value)
                
                return True
            except Exception as e:
                logger.error(f"Error setting key {key} in Redis: {str(e)}")
                return False
    
    def delete(self, key: str) -> bool:
        """Delete key from Redis cache"""
        with self.get_redis_client() as client:
            if not client:
                return False
            
            try:
                result = client.delete(key)
                return result > 0
            except Exception as e:
                logger.error(f"Error deleting key {key} from Redis: {str(e)}")
                return False
    
    def exists(self, key: str) -> bool:
        """Check if key exists in Redis"""
        with self.get_redis_client() as client:
            if not client:
                return False
            
            try:
                return client.exists(key) > 0
            except Exception as e:
                logger.error(f"Error checking existence of key {key} in Redis: {str(e)}")
                return False
    
    def expire(self, key: str, ttl: int) -> bool:
        """Set expiration time for key"""
        with self.get_redis_client() as client:
            if not client:
                return False
            
            try:
                return client.expire(key, ttl)
            except Exception as e:
                logger.error(f"Error setting expiration for key {key} in Redis: {str(e)}")
                return False
    
    def increment(self, key: str, amount: int = 1) -> Optional[int]:
        """Increment value in Redis"""
        with self.get_redis_client() as client:
            if not client:
                return None
            
            try:
                return client.incrby(key, amount)
            except Exception as e:
                logger.error(f"Error incrementing key {key} in Redis: {str(e)}")
                return None
    
    def get_keys_by_pattern(self, pattern: str) -> list:
        """Get keys matching pattern"""
        with self.get_redis_client() as client:
            if not client:
                return []
            
            try:
                return client.keys(pattern)
            except Exception as e:
                logger.error(f"Error getting keys with pattern {pattern} from Redis: {str(e)}")
                return []
    
    def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern"""
        keys = self.get_keys_by_pattern(pattern)
        if not keys:
            return 0
        
        with self.get_redis_client() as client:
            if not client:
                return 0
            
            try:
                return client.delete(*keys)
            except Exception as e:
                logger.error(f"Error clearing keys with pattern {pattern} from Redis: {str(e)}")
                return 0

class RedisCacheService:
    """Enhanced caching service using Redis"""
    
    def __init__(self, redis_service: RedisService):
        self.redis = redis_service
    
    def get_domain_credentials(self, domain: str) -> Optional[Dict[str, str]]:
        """Get cached domain credentials"""
        key = f"{current_app.config.get('REDIS_DOMAIN_CREDENTIALS_PREFIX', 'domain_creds:')}{domain}"
        return self.redis.get(key)
    
    def cache_domain_credentials(self, domain: str, credentials: Dict[str, str], ttl: Optional[int] = None) -> bool:
        """Cache domain credentials"""
        key = f"{current_app.config.get('REDIS_DOMAIN_CREDENTIALS_PREFIX', 'domain_creds:')}{domain}"
        if ttl is None:
            ttl = current_app.config.get('REDIS_CACHE_TTL', 3600)
        
        return self.redis.set(key, credentials, ttl)
    
    def invalidate_domain_credentials(self, domain: str) -> bool:
        """Invalidate cached domain credentials"""
        key = f"{current_app.config.get('REDIS_DOMAIN_CREDENTIALS_PREFIX', 'domain_creds:')}{domain}"
        return self.redis.delete(key)
    
    def get_user_session(self, user_id: str, domain: str) -> Optional[Dict[str, Any]]:
        """Get cached user session"""
        key = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}{domain}:{user_id}"
        return self.redis.get(key)
    
    def cache_user_session(self, user_id: str, domain: str, session_data: Dict[str, Any], ttl: Optional[int] = None) -> bool:
        """Cache user session"""
        key = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}{domain}:{user_id}"
        if ttl is None:
            ttl = current_app.config.get('REDIS_SESSION_TTL', 86400)
        
        return self.redis.set(key, session_data, ttl)
    
    def invalidate_user_session(self, user_id: str, domain: str) -> bool:
        """Invalidate user session"""
        key = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}{domain}:{user_id}"
        return self.redis.delete(key)
    
    def cache_api_response(self, endpoint: str, params: Dict[str, Any], response_data: Any, ttl: Optional[int] = None) -> bool:
        """Cache API response"""
        # Create hash of endpoint and params for cache key
        cache_key = self._generate_api_cache_key(endpoint, params)
        key = f"{current_app.config.get('REDIS_API_CACHE_PREFIX', 'api_cache:')}{cache_key}"
        
        if ttl is None:
            ttl = current_app.config.get('REDIS_CACHE_TTL', 3600)
        
        return self.redis.set(key, response_data, ttl)
    
    def get_cached_api_response(self, endpoint: str, params: Dict[str, Any]) -> Optional[Any]:
        """Get cached API response"""
        cache_key = self._generate_api_cache_key(endpoint, params)
        key = f"{current_app.config.get('REDIS_API_CACHE_PREFIX', 'api_cache:')}{cache_key}"
        return self.redis.get(key)
    
    def _generate_api_cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        """Generate cache key for API endpoint"""
        # Sort params for consistent key generation
        sorted_params = sorted(params.items()) if params else []
        param_string = json.dumps(sorted_params, sort_keys=True)
        return hashlib.md5(f"{endpoint}:{param_string}".encode()).hexdigest()
    
    def rate_limit_check(self, identifier: str, limit: int, window: int) -> Dict[str, Any]:
        """Check rate limit for identifier"""
        key = f"{current_app.config.get('REDIS_RATE_LIMIT_PREFIX', 'rate_limit:')}{identifier}"
        
        with self.redis.get_redis_client() as client:
            if not client:
                return {'allowed': True, 'remaining': limit, 'reset_time': 0}
            
            try:
                # Use Redis pipeline for atomic operations
                pipe = client.pipeline()
                
                # Increment counter
                pipe.incr(key)
                pipe.expire(key, window)
                
                results = pipe.execute()
                current_count = results[0]
                
                # Calculate remaining requests
                remaining = max(0, limit - current_count)
                
                # Get TTL for reset time
                ttl = client.ttl(key)
                reset_time = int(time.time()) + ttl if ttl > 0 else 0
                
                return {
                    'allowed': current_count <= limit,
                    'remaining': remaining,
                    'reset_time': reset_time,
                    'current_count': current_count
                }
                
            except Exception as e:
                logger.error(f"Error checking rate limit for {identifier}: {str(e)}")
                return {'allowed': True, 'remaining': limit, 'reset_time': 0}

class RedisSessionService:
    """Redis-based session management service"""
    
    def __init__(self, redis_service: RedisService):
        self.redis = redis_service
    
    def create_session(self, user_id: str, domain: str, session_data: Dict[str, Any]) -> Optional[str]:
        """Create new user session"""
        session_id = self._generate_session_id(user_id, domain)
        
        session_info = {
            'session_id': session_id,
            'user_id': user_id,
            'domain': domain,
            'created_at': time.time(),
            'last_accessed': time.time(),
            'data': session_data
        }
        
        key = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}{domain}:{session_id}"
        ttl = current_app.config.get('REDIS_SESSION_TTL', 86400)
        
        if self.redis.set(key, session_info, ttl):
            return session_id
        return None
    
    def get_session(self, session_id: str, domain: str) -> Optional[Dict[str, Any]]:
        """Get session by ID"""
        key = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}{domain}:{session_id}"
        session_info = self.redis.get(key)
        
        if session_info:
            # Update last accessed time
            session_info['last_accessed'] = time.time()
            self.redis.set(key, session_info, current_app.config.get('REDIS_SESSION_TTL', 86400))
            
        return session_info
    
    def update_session(self, session_id: str, domain: str, session_data: Dict[str, Any]) -> bool:
        """Update session data"""
        key = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}{domain}:{session_id}"
        session_info = self.redis.get(key)
        
        if session_info:
            session_info['data'].update(session_data)
            session_info['last_accessed'] = time.time()
            
            ttl = current_app.config.get('REDIS_SESSION_TTL', 86400)
            return self.redis.set(key, session_info, ttl)
        
        return False
    
    def destroy_session(self, session_id: str, domain: str) -> bool:
        """Destroy session"""
        key = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}{domain}:{session_id}"
        return self.redis.delete(key)
    
    def destroy_user_sessions(self, user_id: str, domain: str) -> int:
        """Destroy all sessions for a user in a domain"""
        pattern = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}{domain}:*"
        keys = self.redis.get_keys_by_pattern(pattern)
        
        # Filter keys that belong to the specific user
        user_keys = []
        for key in keys:
            session_info = self.redis.get(key)
            if session_info and session_info.get('user_id') == user_id:
                user_keys.append(key)
        
        if user_keys:
            with self.redis.get_redis_client() as client:
                if client:
                    return client.delete(*user_keys)
        
        return 0
    
    def get_session_by_username(self, username: str, domain: str) -> Optional[Dict[str, Any]]:
        """Get session by username (for backward compatibility)"""
        # This is a simplified implementation
        # In a real scenario, you'd need to search through sessions by username
        # For now, we'll return None to indicate no cached session found
        return None
    
    def _generate_session_id(self, user_id: str, domain: str) -> str:
        """Generate unique session ID"""
        timestamp = str(time.time())
        random_data = f"{user_id}:{domain}:{timestamp}"
        return hashlib.sha256(random_data.encode()).hexdigest()[:32]

# Global Redis service instances
redis_service = RedisService()
redis_cache_service = RedisCacheService(redis_service)
redis_session_service = RedisSessionService(redis_service)
