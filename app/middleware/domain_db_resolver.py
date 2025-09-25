import logging
from flask import request, g, current_app, jsonify
from functools import wraps
from typing import Optional, Dict, Any

from app.services.external_api_client import ExternalEnvironmentAPIClient
from app.services.domain_cache_service import DomainCacheService
from app.services.connection_manager import set_db_session_for_domain, cleanup_db_session

logger = logging.getLogger(__name__)

class DomainDatabaseResolver:
    """Middleware for resolving database credentials based on domain"""
    
    def __init__(self, app=None):
        self.app = app
        self.api_client = None
        self.cache_service = DomainCacheService()
        
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize the middleware with Flask app"""
        self.app = app
        
        # Initialize API client with config only if external API URL is provided
        external_api_base_url = app.config.get('EXTERNAL_API_BASE_URL')
        external_api_timeout = app.config.get('EXTERNAL_API_TIMEOUT', 30)
        
        print(f"DEBUG: EXTERNAL_API_BASE_URL = {external_api_base_url}")
        print(f"DEBUG: EXTERNAL_API_TIMEOUT = {external_api_timeout}")
        
        if external_api_base_url:
            self.api_client = ExternalEnvironmentAPIClient(
                base_url=external_api_base_url,
                timeout=external_api_timeout
            )
            logger.info("External API client initialized")
        else:
            self.api_client = None
            logger.info("No external API URL configured - running in localhost mode")
            print("DEBUG: No external API URL configured - running in localhost mode")
        
        # Register middleware functions
        app.before_request(self.before_request)
        app.teardown_appcontext(self.teardown_appcontext)
        
        logger.info("Domain Database Resolver middleware initialized")
        print("DEBUG: Domain Database Resolver middleware initialized")
    
    
    def get_cached_credentials(self, domain: str) -> Optional[Dict[str, str]]:
        """
        Get cached database credentials for a domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            PostgreSQL credentials dictionary or None if not cached
        """
        return self.cache_service.get_credentials(domain)
    
    def fetch_credentials_from_api(self, url: str) -> Optional[Dict[str, str]]:
        """
        Fetch database credentials from external API
        
        Args:
            url: Complete URL to send to API
            
        Returns:
            PostgreSQL credentials dictionary or None if failed
        """
        if not self.api_client:
            logger.error("No external API client configured - cannot fetch credentials from API")
            return None
            
        try:
            # Call external API
            api_response = self.api_client.get_environment_variables(url)
            if not api_response:
                logger.error(f"Failed to get response from external API for URL: {url}")
                return None
            
            # Extract PostgreSQL credentials
            postgres_creds = self.api_client.extract_postgres_credentials(api_response)
            if not postgres_creds:
                logger.error(f"Failed to extract PostgreSQL credentials for URL: {url}")
                return None
            
            logger.info(f"Successfully fetched credentials from API for URL: {url}")
            return postgres_creds
            
        except Exception as e:
            logger.error(f"Error fetching credentials from API for URL {url}: {str(e)}")
            return None
    
    def resolve_database_credentials(self, url: str, domain: str) -> Optional[Dict[str, str]]:
        """
        Resolve database credentials for a domain (cache first, then API)
        
        Args:
            url: Complete URL
            domain: Domain identifier
            
        Returns:
            PostgreSQL credentials dictionary or None if resolution failed
        """
        # First, try to get from cache
        cached_creds = self.get_cached_credentials(domain)
        if cached_creds:
            logger.info(f"Using cached credentials for domain: {domain}")
            return cached_creds
        
        # If not cached, fetch from API
        logger.info(f"Fetching credentials from API for domain: {domain}")
        api_creds = self.fetch_credentials_from_api(url)
        
        if api_creds:
            # Cache the credentials
            cache_ttl = current_app.config.get('DOMAIN_CACHE_TTL', 3600)  # Default 1 hour
            self.cache_service.cache_credentials(domain, api_creds, cache_ttl)
            logger.info(f"Cached credentials for domain: {domain}")
            return api_creds
        
        return None
    
    def before_request(self):
        """
        Flask before_request handler - simplified for frontend-initiated approach
        """
        # Only handle domain resolver API requests, skip everything else
        if not request.path.startswith('/api/domain/'):
            return
            
        logger.debug(f"Domain resolver API request: {request.url}")
        print(f"DEBUG: Domain resolver API request: {request.url}")
    
    def teardown_appcontext(self, error):
        """
        Flask teardown handler to clean up database session
        """
        try:
            cleanup_db_session()
        except Exception as e:
            logger.error(f"Error cleaning up database session: {str(e)}")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return self.cache_service.get_cache_info()
    
    def invalidate_domain_cache(self, domain: str) -> bool:
        """
        Manually invalidate cache for a domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            True if cache was invalidated, False if not found
        """
        return self.cache_service.invalidate_domain(domain)
    
    def clear_all_cache(self):
        """Clear all cached credentials"""
        self.cache_service.clear_all_cache()

# Global middleware instance
domain_db_resolver = DomainDatabaseResolver()

def require_domain_db(f):
    """
    Decorator to ensure database session is available for the current domain
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not hasattr(g, 'db_session') or g.db_session is None:
            logger.error("No database session available for current domain")
            return jsonify({
                'error': 'Database not available for this domain'
            }), 503
        
        return f(*args, **kwargs)
    
    return decorated_function
