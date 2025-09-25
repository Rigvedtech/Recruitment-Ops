import logging
import time
from typing import Dict, Optional, Any
from threading import Lock
import json

logger = logging.getLogger(__name__)

class DomainCredentialCache:
    """In-memory cache for domain database credentials"""
    
    def __init__(self, default_ttl: int = 3600):  # Default 1 hour TTL
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = Lock()
        self.default_ttl = default_ttl
    
    def _is_expired(self, cache_entry: Dict[str, Any]) -> bool:
        """Check if cache entry is expired"""
        return time.time() > cache_entry.get('expires_at', 0)
    
    def get(self, domain: str) -> Optional[Dict[str, str]]:
        """
        Get cached credentials for a domain
        
        Args:
            domain: Domain identifier (e.g., 'rgvdit-rops.rigvedtech.com:3000')
            
        Returns:
            Dictionary with PostgreSQL credentials or None if not found/expired
        """
        with self._lock:
            if domain not in self._cache:
                logger.debug(f"No cache entry found for domain: {domain}")
                return None
            
            cache_entry = self._cache[domain]
            
            # Check if expired
            if self._is_expired(cache_entry):
                logger.info(f"Cache entry expired for domain: {domain}")
                del self._cache[domain]
                return None
            
            logger.debug(f"Cache hit for domain: {domain}")
            return cache_entry['credentials'].copy()
    
    def set(self, domain: str, credentials: Dict[str, str], ttl: Optional[int] = None) -> None:
        """
        Cache credentials for a domain
        
        Args:
            domain: Domain identifier
            credentials: PostgreSQL credentials dictionary
            ttl: Time to live in seconds (uses default_ttl if None)
        """
        if ttl is None:
            ttl = self.default_ttl
        
        expires_at = time.time() + ttl
        
        cache_entry = {
            'credentials': credentials.copy(),
            'cached_at': time.time(),
            'expires_at': expires_at,
            'ttl': ttl
        }
        
        with self._lock:
            self._cache[domain] = cache_entry
            logger.info(f"Cached credentials for domain: {domain} (TTL: {ttl}s)")
    
    def delete(self, domain: str) -> bool:
        """
        Remove cached credentials for a domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            True if entry was removed, False if not found
        """
        with self._lock:
            if domain in self._cache:
                del self._cache[domain]
                logger.info(f"Removed cache entry for domain: {domain}")
                return True
            else:
                logger.debug(f"No cache entry to remove for domain: {domain}")
                return False
    
    def clear(self) -> None:
        """Clear all cached entries"""
        with self._lock:
            cleared_count = len(self._cache)
            self._cache.clear()
            logger.info(f"Cleared {cleared_count} cache entries")
    
    def cleanup_expired(self) -> int:
        """
        Remove all expired cache entries
        
        Returns:
            Number of entries removed
        """
        expired_domains = []
        
        with self._lock:
            current_time = time.time()
            for domain, cache_entry in self._cache.items():
                if current_time > cache_entry.get('expires_at', 0):
                    expired_domains.append(domain)
            
            for domain in expired_domains:
                del self._cache[domain]
        
        if expired_domains:
            logger.info(f"Cleaned up {len(expired_domains)} expired cache entries")
        
        return len(expired_domains)
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics
        
        Returns:
            Dictionary with cache statistics
        """
        with self._lock:
            current_time = time.time()
            total_entries = len(self._cache)
            expired_entries = 0
            active_entries = 0
            
            for cache_entry in self._cache.values():
                if current_time > cache_entry.get('expires_at', 0):
                    expired_entries += 1
                else:
                    active_entries += 1
            
            return {
                'total_entries': total_entries,
                'active_entries': active_entries,
                'expired_entries': expired_entries,
                'cache_domains': list(self._cache.keys())
            }
    
    def has_domain(self, domain: str) -> bool:
        """
        Check if domain exists in cache (regardless of expiry)
        
        Args:
            domain: Domain identifier
            
        Returns:
            True if domain exists in cache, False otherwise
        """
        with self._lock:
            return domain in self._cache

# Global cache instance
domain_cache = DomainCredentialCache()

class DomainCacheService:
    """Service for managing domain credential caching"""
    
    def __init__(self, cache: DomainCredentialCache = None):
        self.cache = cache or domain_cache
    
    def get_credentials(self, domain: str) -> Optional[Dict[str, str]]:
        """
        Get cached credentials for a domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            PostgreSQL credentials or None if not cached/expired
        """
        return self.cache.get(domain)
    
    def cache_credentials(self, domain: str, credentials: Dict[str, str], ttl: Optional[int] = None) -> None:
        """
        Cache credentials for a domain
        
        Args:
            domain: Domain identifier
            credentials: PostgreSQL credentials
            ttl: Time to live in seconds
        """
        # Validate credentials before caching
        required_keys = ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD']
        missing_keys = [key for key in required_keys if key not in credentials]
        
        if missing_keys:
            logger.error(f"Cannot cache incomplete credentials for domain {domain}. Missing: {missing_keys}")
            return
        
        self.cache.set(domain, credentials, ttl)
    
    def invalidate_domain(self, domain: str) -> bool:
        """
        Invalidate cached credentials for a domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            True if cache entry was removed, False if not found
        """
        return self.cache.delete(domain)
    
    def clear_all_cache(self) -> None:
        """Clear all cached credentials"""
        self.cache.clear()
    
    def cleanup_expired_entries(self) -> int:
        """
        Clean up expired cache entries
        
        Returns:
            Number of entries cleaned up
        """
        return self.cache.cleanup_expired()
    
    def get_cache_info(self) -> Dict[str, Any]:
        """Get cache statistics and information"""
        return self.cache.get_cache_stats()
    
    def is_domain_cached(self, domain: str) -> bool:
        """
        Check if domain has valid cached credentials
        
        Args:
            domain: Domain identifier
            
        Returns:
            True if domain has valid cached credentials, False otherwise
        """
        credentials = self.cache.get(domain)
        return credentials is not None
