import logging
from typing import Dict, Optional, Any
from flask import current_app, request
from app.services.connection_manager import connection_manager, set_db_session_for_domain
from app.services.domain_cache_service import DomainCacheService
from app.services.external_api_client import ExternalEnvironmentAPIClient

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Manages domain-to-database mapping and switching for domain isolation"""
    
    def __init__(self):
        self.cache_service = DomainCacheService()
        self.api_client = None
        self._domain_mappings = {
            'rgvdit-rops.rigvedtech.com:3000': 'rigvedit_prod',
            'finq-ops.rigvedtech.com:3000': 'finquest_recops',
            'localhost:3000': 'rigvedit_dev',
            '127.0.0.1:3000': 'rigvedit_dev'
        }
        
    def init_app(self, app):
        """Initialize the database manager with Flask app"""
        # Initialize API client if external API URL is provided
        external_api_base_url = app.config.get('EXTERNAL_API_BASE_URL')
        external_api_timeout = app.config.get('EXTERNAL_API_TIMEOUT', 30)
        
        if external_api_base_url:
            self.api_client = ExternalEnvironmentAPIClient(
                base_url=external_api_base_url,
                timeout=external_api_timeout
            )
            logger.info("Database manager initialized with external API client")
        else:
            logger.info("Database manager initialized in localhost mode")
    
    def get_domain_from_request(self) -> str:
        """
        Extract domain from the current request
        
        Returns:
            Domain string (e.g., 'rgvdit-rops.rigvedtech.com:3000')
        """
        # Get domain from request
        host = request.headers.get('Host', '')
        if not host:
            # Fallback to request host
            host = request.host
            if request.port and request.port != 80 and request.port != 443:
                host = f"{host}:{request.port}"
        
        logger.debug(f"Extracted domain from request: {host}")
        return host
    
    def get_database_name_for_domain(self, domain: str) -> Optional[str]:
        """
        Get the database name for a specific domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            Database name or None if not found
        """
        # Check if domain has a direct mapping
        if domain in self._domain_mappings:
            db_name = self._domain_mappings[domain]
            logger.info(f"Found direct mapping for domain {domain} -> {db_name}")
            return db_name
        
        # Try to extract domain without port for mapping
        domain_without_port = domain.split(':')[0]
        if domain_without_port in self._domain_mappings:
            db_name = self._domain_mappings[domain_without_port]
            logger.info(f"Found mapping for domain {domain_without_port} -> {db_name}")
            return db_name
        
        logger.warning(f"No database mapping found for domain: {domain}")
        return None
    
    def get_database_credentials_for_domain(self, domain: str) -> Optional[Dict[str, str]]:
        """
        Get database credentials for a domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            PostgreSQL credentials dictionary or None if not found
        """
        # First, try to get from cache
        cached_creds = self.cache_service.get_credentials(domain)
        if cached_creds:
            logger.info(f"Using cached credentials for domain: {domain}")
            return cached_creds
        
        # If not cached and we have an API client, fetch from API
        if self.api_client:
            try:
                # Construct API URL for domain
                api_url = f"https://{domain}"
                logger.info(f"Fetching credentials from API for domain: {domain}")
                
                api_response = self.api_client.get_environment_variables(api_url)
                if api_response:
                    postgres_creds = self.api_client.extract_postgres_credentials(api_response)
                    if postgres_creds:
                        # Cache the credentials
                        cache_ttl = current_app.config.get('DOMAIN_CACHE_TTL', 3600)
                        self.cache_service.cache_credentials(domain, postgres_creds, cache_ttl)
                        logger.info(f"Cached credentials for domain: {domain}")
                        return postgres_creds
            except Exception as e:
                logger.error(f"Error fetching credentials from API for domain {domain}: {str(e)}")
        
        logger.error(f"No database credentials found for domain: {domain}")
        return None
    
    def switch_to_domain_database(self, domain: str) -> bool:
        """
        Switch to the appropriate database for the given domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            True if database switch was successful, False otherwise
        """
        try:
            # Get database credentials for domain
            postgres_creds = self.get_database_credentials_for_domain(domain)
            if not postgres_creds:
                logger.error(f"No database credentials available for domain: {domain}")
                return False
            
            # Set database session for domain
            success = set_db_session_for_domain(domain, postgres_creds)
            if success:
                logger.info(f"Successfully switched to database for domain: {domain}")
                return True
            else:
                logger.error(f"Failed to switch to database for domain: {domain}")
                return False
                
        except Exception as e:
            logger.error(f"Error switching to domain database for {domain}: {str(e)}")
            return False
    
    def ensure_domain_database_isolation(self) -> bool:
        """
        Ensure the current request is using the correct database for its domain
        
        Returns:
            True if domain isolation is properly set up, False otherwise
        """
        try:
            # Get domain from current request
            domain = self.get_domain_from_request()
            if not domain:
                logger.error("Could not determine domain from request")
                return False
            
            # Check if we already have the correct database session
            from flask import g
            if hasattr(g, 'domain') and g.domain == domain:
                logger.debug(f"Database session already set for domain: {domain}")
                return True
            
            # Switch to domain-specific database
            return self.switch_to_domain_database(domain)
            
        except Exception as e:
            logger.error(f"Error ensuring domain database isolation: {str(e)}")
            return False
    
    def validate_user_belongs_to_domain(self, username: str, domain: str) -> bool:
        """
        Validate that a user belongs to the current domain's database
        
        Args:
            username: Username to validate
            domain: Domain identifier
            
        Returns:
            True if user belongs to domain, False otherwise
        """
        try:
            # Ensure we're using the correct database for this domain
            if not self.switch_to_domain_database(domain):
                logger.error(f"Could not switch to database for domain: {domain}")
                return False
            
            # Check if user exists in the domain's database
            from flask import g
            if not hasattr(g, 'db_session') or g.db_session is None:
                logger.error("No database session available for user validation")
                return False
            
            # Query user in domain-specific database
            from app.models.user import User
            user = g.db_session.query(User).filter_by(username=username).first()
            
            if user:
                logger.info(f"User {username} found in domain {domain} database")
                return True
            else:
                logger.warning(f"User {username} not found in domain {domain} database")
                return False
                
        except Exception as e:
            logger.error(f"Error validating user {username} for domain {domain}: {str(e)}")
            return False
    
    def get_domain_info(self, domain: str) -> Dict[str, Any]:
        """
        Get information about a domain's database configuration
        
        Args:
            domain: Domain identifier
            
        Returns:
            Dictionary with domain information
        """
        db_name = self.get_database_name_for_domain(domain)
        credentials = self.get_database_credentials_for_domain(domain)
        
        return {
            'domain': domain,
            'database_name': db_name,
            'has_credentials': credentials is not None,
            'has_active_connection': domain in connection_manager.get_active_domains()
        }
    
    def add_domain_mapping(self, domain: str, database_name: str):
        """
        Add a new domain-to-database mapping
        
        Args:
            domain: Domain identifier
            database_name: Database name
        """
        self._domain_mappings[domain] = database_name
        logger.info(f"Added domain mapping: {domain} -> {database_name}")
    
    def remove_domain_mapping(self, domain: str):
        """
        Remove a domain-to-database mapping
        
        Args:
            domain: Domain identifier
        """
        if domain in self._domain_mappings:
            del self._domain_mappings[domain]
            logger.info(f"Removed domain mapping: {domain}")
    
    def get_all_domain_mappings(self) -> Dict[str, str]:
        """
        Get all domain-to-database mappings
        
        Returns:
            Dictionary of domain mappings
        """
        return self._domain_mappings.copy()

# Global database manager instance
database_manager = DatabaseManager()
