import logging
from typing import Dict, Optional
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool
from flask import g
import threading
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)

class DatabaseConnectionManager:
    """Manages dynamic database connections for different domains"""
    
    def __init__(self):
        self._engines: Dict[str, Engine] = {}
        self._session_factories: Dict[str, scoped_session] = {}
        self._lock = threading.Lock()
    
    def get_database_url(self, postgres_creds: Dict[str, str]) -> str:
        """
        Build PostgreSQL database URL from credentials
        
        Args:
            postgres_creds: Dictionary with PostgreSQL credentials
            
        Returns:
            PostgreSQL connection URL string
        """
        host = postgres_creds['POSTGRES_HOST']
        port = postgres_creds['POSTGRES_PORT']
        database = postgres_creds['POSTGRES_DB']
        user = postgres_creds['POSTGRES_USER']
        password = postgres_creds['POSTGRES_PASSWORD']
        
        # URL encode username and password to handle special characters like @
        encoded_user = quote_plus(user)
        encoded_password = quote_plus(password)
        
        db_url = f"postgresql://{encoded_user}:{encoded_password}@{host}:{port}/{database}"
        logger.info(f"Built database URL for host {host}:{port}")
        return db_url
    
    def get_or_create_engine(self, domain: str, postgres_creds: Dict[str, str]) -> Optional[Engine]:
        """
        Get existing engine for domain or create new one
        
        Args:
            domain: Domain identifier (e.g., 'rgvdit-rops.rigvedtech.com:3000')
            postgres_creds: PostgreSQL credentials dictionary
            
        Returns:
            SQLAlchemy Engine instance or None if creation failed
        """
        with self._lock:
            # Return existing engine if available
            if domain in self._engines:
                logger.info(f"Using existing database engine for domain: {domain}")
                return self._engines[domain]
            
            try:
                # Create database URL
                db_url = self.get_database_url(postgres_creds)   
                
                # Create engine with connection pooling
                engine = create_engine(
                    db_url,
                    poolclass=QueuePool,
                    pool_size=15,       # requests per domain
                    max_overflow=25,    # allows temporary expansion under load
                    pool_timeout=60,   # wait time for a connection to be established   (default 30 seconds)
                    pool_recycle=600,  # Recycle connections after 2 hour
                    pool_pre_ping=True,  # check if connection is still valid before use
                    echo=False  # Set to True for SQL debugging
                )
                
                # Test the connection
                with engine.connect() as conn:
                    conn.execute("SELECT 1")
                
                # Store engine
                self._engines[domain] = engine
                
                # Create session factory
                session_factory = sessionmaker(bind=engine)
                self._session_factories[domain] = scoped_session(session_factory)
                
                logger.info(f"Created new database engine for domain: {domain}")
                return engine
                
            except Exception as e:
                logger.error(f"Failed to create database engine for domain {domain}: {str(e)}")
                return None
    
    def get_session(self, domain: str) -> Optional[scoped_session]:
        """
        Get database session for a domain
        
        Args:
            domain: Domain identifier
            
        Returns:
            SQLAlchemy scoped session or None if not available
        """
        if domain in self._session_factories:
            return self._session_factories[domain]
        else:
            logger.error(f"No session factory found for domain: {domain}")
            return None
    
    def close_domain_connections(self, domain: str):
        """
        Close all connections for a specific domain
        
        Args:
            domain: Domain identifier
        """
        with self._lock:
            if domain in self._session_factories:
                try:
                    self._session_factories[domain].remove()
                    del self._session_factories[domain]
                    logger.info(f"Closed session factory for domain: {domain}")
                except Exception as e:
                    logger.error(f"Error closing session factory for domain {domain}: {str(e)}")
            
            if domain in self._engines:
                try:
                    self._engines[domain].dispose()
                    del self._engines[domain]
                    logger.info(f"Disposed database engine for domain: {domain}")
                except Exception as e:
                    logger.error(f"Error disposing engine for domain {domain}: {str(e)}")
    
    def close_all_connections(self):
        """Close all database connections"""
        with self._lock:
            # Close all session factories
            for domain in list(self._session_factories.keys()):
                try:
                    self._session_factories[domain].remove()
                    logger.info(f"Closed session factory for domain: {domain}")
                except Exception as e:
                    logger.error(f"Error closing session factory for domain {domain}: {str(e)}")
            
            self._session_factories.clear()
            
            # Dispose all engines
            for domain, engine in list(self._engines.items()):
                try:
                    engine.dispose()
                    logger.info(f"Disposed database engine for domain: {domain}")
                except Exception as e:
                    logger.error(f"Error disposing engine for domain {domain}: {str(e)}")
            
            self._engines.clear()
    
    def get_active_domains(self) -> list:
        """Get list of domains with active connections"""
        return list(self._engines.keys())

# Global connection manager instance
connection_manager = DatabaseConnectionManager()

def get_current_db_session():
    """
    Get the current database session from Flask g context
    
    Returns:
        Database session for current domain or None
    """
    if hasattr(g, 'db_session') and g.db_session is not None:
        return g.db_session
    else:
        logger.warning("No database session found in current request context")
        return None

def set_db_session_for_domain(domain: str, postgres_creds: Dict[str, str]) -> bool:
    """
    Set database session for current request based on domain
    
    Args:
        domain: Domain identifier
        postgres_creds: PostgreSQL credentials
        
    Returns:
        True if session was set successfully, False otherwise
    """
    try:
        # Get or create engine for domain
        engine = connection_manager.get_or_create_engine(domain, postgres_creds)
        if not engine:
            return False
        
        # Get session for domain
        session_factory = connection_manager.get_session(domain)
        if not session_factory:
            return False
        
        # Create session for this request
        session = session_factory()
        
        # Store in Flask g context
        g.db_session = session
        g.domain = domain
        
        logger.info(f"Set database session for domain: {domain}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to set database session for domain {domain}: {str(e)}")
        return False

def cleanup_db_session():
    """Clean up database session from Flask g context"""
    if hasattr(g, 'db_session') and g.db_session is not None:
        try:
            g.db_session.close()
            g.db_session = None
            logger.debug("Cleaned up database session")
        except Exception as e:
            logger.error(f"Error cleaning up database session: {str(e)}")
