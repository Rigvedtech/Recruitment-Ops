import logging
import time
from typing import Dict, Optional, Any
from app.services.redis_service import redis_cache_service, redis_service
from app.services.domain_cache_service import DomainCacheService

logger = logging.getLogger(__name__)

class RedisDomainCacheService:
    """Enhanced domain cache service with Redis backend and in-memory fallback"""
    
    def __init__(self):
        self.fallback_cache = DomainCacheService()
        self.redis_available = redis_service.is_available()
        
        # Note: During initial import, redis_service might not be initialized yet
        # The reinitialize_redis_connection() method will be called after redis_service.init_app()
        if self.redis_available:
            logger.info("Redis-based domain cache service initialized")
        else:
            logger.debug("Redis connection will be established during app initialization")
    
    def reinitialize_redis_connection(self):
        """Re-check Redis availability (useful after redis_service.init_app is called)"""
        self.redis_available = redis_service.is_available()
        if self.redis_available:
            logger.info("Redis-based domain cache service now connected")
        else:
            logger.warning("Redis still not available, continuing with in-memory cache")
    
    def get_credentials(self, domain: str) -> Optional[Dict[str, str]]:
        """
        Get cached credentials for a domain (Redis first, fallback to in-memory)
        
        Args:
            domain: Domain identifier
            
        Returns:
            PostgreSQL credentials or None if not cached/expired
        """
        # Try Redis first if available
        if self.redis_available:
            try:
                credentials = redis_cache_service.get_domain_credentials(domain)
                if credentials:
                    logger.debug(f"Redis cache hit for domain: {domain}")
                    return credentials
            except Exception as e:
                logger.error(f"Error getting credentials from Redis for domain {domain}: {str(e)}")
                # Fallback to in-memory cache
                self.redis_available = False
        
        # Fallback to in-memory cache
        credentials = self.fallback_cache.get_credentials(domain)
        if credentials:
            logger.debug(f"In-memory cache hit for domain: {domain}")
            
            # Try to sync back to Redis if it becomes available
            if redis_service.is_available():
                try:
                    cache_ttl = redis_service.app.config.get('REDIS_CACHE_TTL', 3600)
                    redis_cache_service.cache_domain_credentials(domain, credentials, cache_ttl)
                    self.redis_available = True
                except Exception:
                    pass
        
        return credentials
    
    def cache_credentials(self, domain: str, credentials: Dict[str, str], ttl: Optional[int] = None) -> None:
        """
        Cache credentials for a domain (Redis first, fallback to in-memory)
        
        Args:
            domain: Domain identifier
            credentials: PostgreSQL credentials dictionary
            ttl: Time to live in seconds
        """
        # Cache in both Redis and in-memory for redundancy
        success = False
        
        # Try Redis first if available
        if self.redis_available:
            try:
                if redis_cache_service.cache_domain_credentials(domain, credentials, ttl):
                    logger.debug(f"Cached credentials in Redis for domain: {domain}")
                    success = True
            except Exception as e:
                logger.error(f"Error caching credentials in Redis for domain {domain}: {str(e)}")
                self.redis_available = False
        
        # Always cache in in-memory as fallback
        try:
            self.fallback_cache.cache_credentials(domain, credentials, ttl)
            logger.debug(f"Cached credentials in memory for domain: {domain}")
            success = True
        except Exception as e:
            logger.error(f"Error caching credentials in memory for domain {domain}: {str(e)}")
        
        if not success:
            logger.error(f"Failed to cache credentials for domain: {domain}")
    
    def invalidate_domain(self, domain: str) -> bool:
        """
        Invalidate cached credentials for a domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            True if cache entry was removed from at least one cache, False otherwise
        """
        redis_success = False
        memory_success = False
        
        # Invalidate from Redis if available
        if self.redis_available:
            try:
                redis_success = redis_cache_service.invalidate_domain_credentials(domain)
                if redis_success:
                    logger.debug(f"Invalidated Redis cache for domain: {domain}")
            except Exception as e:
                logger.error(f"Error invalidating Redis cache for domain {domain}: {str(e)}")
        
        # Invalidate from in-memory cache
        try:
            memory_success = self.fallback_cache.invalidate_domain(domain)
            if memory_success:
                logger.debug(f"Invalidated memory cache for domain: {domain}")
        except Exception as e:
            logger.error(f"Error invalidating memory cache for domain {domain}: {str(e)}")
        
        return redis_success or memory_success
    
    def clear_all_cache(self) -> None:
        """Clear all cached credentials"""
        # Clear Redis cache if available
        if self.redis_available:
            try:
                pattern = f"{redis_service.app.config.get('REDIS_DOMAIN_CREDENTIALS_PREFIX', 'domain_creds:')}*"
                cleared_count = redis_service.clear_pattern(pattern)
                logger.info(f"Cleared {cleared_count} Redis cache entries")
            except Exception as e:
                logger.error(f"Error clearing Redis cache: {str(e)}")
        
        # Clear in-memory cache
        try:
            self.fallback_cache.clear_all_cache()
            logger.info("Cleared in-memory cache")
        except Exception as e:
            logger.error(f"Error clearing in-memory cache: {str(e)}")
    
    def cleanup_expired_entries(self) -> int:
        """
        Clean up expired cache entries
        
        Returns:
            Number of entries cleaned up
        """
        cleaned_count = 0
        
        # Redis handles expiration automatically, but we can clean up memory cache
        try:
            cleaned_count = self.fallback_cache.cleanup_expired_entries()
            logger.debug(f"Cleaned up {cleaned_count} expired memory cache entries")
        except Exception as e:
            logger.error(f"Error cleaning up expired memory cache entries: {str(e)}")
        
        return cleaned_count
    
    def get_cache_info(self) -> Dict[str, Any]:
        """Get cache statistics and information"""
        info = {
            'redis_available': self.redis_available,
            'memory_cache': self.fallback_cache.get_cache_info()
        }
        
        # Add Redis cache info if available
        if self.redis_available:
            try:
                pattern = f"{redis_service.app.config.get('REDIS_DOMAIN_CREDENTIALS_PREFIX', 'domain_creds:')}*"
                redis_keys = redis_service.get_keys_by_pattern(pattern)
                info['redis_cache'] = {
                    'total_entries': len(redis_keys),
                    'domains': [key.split(':')[-1] for key in redis_keys]
                }
            except Exception as e:
                logger.error(f"Error getting Redis cache info: {str(e)}")
                info['redis_cache'] = {'error': str(e)}
        
        return info
    
    def is_domain_cached(self, domain: str) -> bool:
        """
        Check if domain has valid cached credentials
        
        Args:
            domain: Domain identifier
            
        Returns:
            True if domain has valid cached credentials in any cache, False otherwise
        """
        # Check Redis first if available
        if self.redis_available:
            try:
                credentials = redis_cache_service.get_domain_credentials(domain)
                if credentials:
                    return True
            except Exception as e:
                logger.error(f"Error checking Redis cache for domain {domain}: {str(e)}")
        
        # Check in-memory cache
        return self.fallback_cache.is_domain_cached(domain)
    
    def sync_cache_to_redis(self) -> int:
        """
        Sync in-memory cache to Redis (useful when Redis becomes available)
        
        Returns:
            Number of entries synced
        """
        if not redis_service.is_available():
            return 0
        
        synced_count = 0
        memory_info = self.fallback_cache.get_cache_info()
        
        # Get all domains from memory cache
        for domain in memory_info.get('cache_domains', []):
            try:
                # Get credentials from memory cache
                credentials = self.fallback_cache.get_credentials(domain)
                if credentials:
                    # Cache in Redis
                    cache_ttl = redis_service.app.config.get('REDIS_CACHE_TTL', 3600)
                    if redis_cache_service.cache_domain_credentials(domain, credentials, cache_ttl):
                        synced_count += 1
                        logger.debug(f"Synced credentials to Redis for domain: {domain}")
            except Exception as e:
                logger.error(f"Error syncing domain {domain} to Redis: {str(e)}")
        
        if synced_count > 0:
            logger.info(f"Synced {synced_count} domain credentials to Redis")
            self.redis_available = True
        
        return synced_count
    
    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on cache services
        
        Returns:
            Dictionary with health status
        """
        health = {
            'redis_available': False,
            'memory_cache_healthy': False,
            'timestamp': time.time()
        }
        
        # Check Redis health
        if redis_service.is_available():
            try:
                redis_service.redis_client.ping()
                health['redis_available'] = True
            except Exception as e:
                logger.error(f"Redis health check failed: {str(e)}")
                health['redis_error'] = str(e)
        
        # Check memory cache health
        try:
            memory_info = self.fallback_cache.get_cache_info()
            health['memory_cache_healthy'] = True
            health['memory_cache_stats'] = memory_info
        except Exception as e:
            logger.error(f"Memory cache health check failed: {str(e)}")
            health['memory_cache_error'] = str(e)
        
        return health

# Global enhanced domain cache service instance
enhanced_domain_cache_service = RedisDomainCacheService()


