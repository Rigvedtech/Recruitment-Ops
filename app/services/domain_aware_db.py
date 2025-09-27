"""
Domain-aware database service that automatically routes queries to the correct domain database.

This module implements dynamic SQLAlchemy session binding that allows existing code
to work without changes while automatically using domain-specific database connections.
"""

import logging
from flask import g, has_request_context
from sqlalchemy.orm import Query, scoped_session
from sqlalchemy.orm.query import Query as BaseQuery
from app.database import db

logger = logging.getLogger(__name__)

class DomainAwareQuery(BaseQuery):
    """
    Custom Query class that automatically uses domain-specific session when available.
    
    This class extends SQLAlchemy's base Query to check for domain-specific sessions
    in Flask's g context before falling back to the default db.session.
    """
    
    def __init__(self, entities, session=None):
        """
        Initialize query with automatic session selection.
        
        Args:
            entities: The model entities to query
            session: Optional explicit session (if None, will auto-select)
        """
        if session is None:
            session = self._get_appropriate_session()
        
        super().__init__(entities, session)
    
    def _get_appropriate_session(self):
        """
        Get the appropriate database session based on current context.
        
        Returns:
            SQLAlchemy session - domain-specific if available, otherwise default
        """
        # Only check for domain session if we're in a request context
        if has_request_context():
            # Check if we have a domain-specific session
            if hasattr(g, 'db_session') and g.db_session is not None:
                logger.debug("Using domain-specific database session")
                return g.db_session
        
        # Fall back to default session
        logger.debug("Using default database session")
        return db.session

class DomainAwareSessionMixin:
    """
    Mixin to add domain-aware query capabilities to models.
    
    This mixin overrides the query_class to use our DomainAwareQuery,
    enabling automatic domain-specific database routing.
    """
    
    query_class = DomainAwareQuery
    
    @classmethod
    def get_session(cls):
        """
        Get the appropriate session for this model.
        
        Returns:
            SQLAlchemy session - domain-specific if available, otherwise default
        """
        if has_request_context() and hasattr(g, 'db_session') and g.db_session is not None:
            return g.db_session
        return db.session

def setup_domain_aware_models():
    """
    Configure all models to use domain-aware queries.
    
    This function modifies all existing models to use the DomainAwareQuery class,
    enabling automatic domain-specific database routing without code changes.
    """
    try:
        # Import all active models (excluding deprecated ones)
        from app.models.user import User
        from app.models.profile import Profile
        from app.models.requirement import Requirement
        from app.models.skills import Skills
        from app.models.email_details import EmailDetails
        from app.models.profile_records import ProfileRecords
        from app.models.screening import Screening
        from app.models.interview_scheduled import InterviewScheduled
        from app.models.interview_round_one import InterviewRoundOne
        from app.models.interview_round_two import InterviewRoundTwo
        from app.models.offer import Offer
        from app.models.onboarding import Onboarding
        from app.models.api import Api
        from app.models.system_settings import SystemSettings
        from app.models.meeting import Meeting
        from app.models.sla_config import SLAConfig
        from app.models.sla_tracker import SLATracker
        from app.models.notification import Notification
        
        # Include deprecated models only if they're still being used
        # These are kept for backward compatibility but should be phased out
        try:
            from app.models.status_tracker import StatusTracker
            from app.models.tracker import Tracker
            from app.models.workflow_progress import WorkflowProgress
            deprecated_models = [StatusTracker, Tracker, WorkflowProgress]
        except ImportError:
            deprecated_models = []
        
        # List of all active models to configure
        active_models = [
            User, Profile, Requirement, Skills, EmailDetails, ProfileRecords,
            Screening, InterviewScheduled, InterviewRoundOne, InterviewRoundTwo,
            Offer, Onboarding, Api, SystemSettings, Meeting, SLAConfig,
            SLATracker, Notification
        ]
        
        # Combine active and deprecated models
        models = active_models + deprecated_models
        
        # Configure each model to use domain-aware queries
        for model in models:
            try:
                # Set the custom query class
                model.query_class = DomainAwareQuery
                
                # Add the session getter method
                model.get_session = classmethod(lambda cls: 
                    g.db_session if (has_request_context() and hasattr(g, 'db_session') and g.db_session is not None) 
                    else db.session
                )
                
                logger.debug(f"Configured domain-aware queries for model: {model.__name__}")
                
            except Exception as e:
                logger.error(f"Failed to configure domain-aware queries for model {model.__name__}: {str(e)}")
                continue
        
        logger.info(f"Successfully configured domain-aware queries for {len(models)} models")
        
    except Exception as e:
        logger.error(f"Error setting up domain-aware models: {str(e)}")
        raise

def get_current_session():
    """
    Get the current database session (domain-specific or default).
    
    Returns:
        SQLAlchemy session
    """
    if has_request_context() and hasattr(g, 'db_session') and g.db_session is not None:
        return g.db_session
    return db.session

def is_using_domain_session():
    """
    Check if we're currently using a domain-specific session.
    
    Returns:
        bool: True if using domain session, False if using default session
    """
    return (has_request_context() and 
            hasattr(g, 'db_session') and 
            g.db_session is not None)

def get_current_domain():
    """
    Get the current domain being used.
    
    Returns:
        str: Domain name or None if not in domain context
    """
    if has_request_context() and hasattr(g, 'domain'):
        return g.domain
    return None

# Utility function for debugging
def debug_session_info():
    """
    Get debug information about current session state.
    
    Returns:
        dict: Debug information about current session
    """
    info = {
        'has_request_context': has_request_context(),
        'using_domain_session': is_using_domain_session(),
        'current_domain': get_current_domain(),
        'session_type': 'domain' if is_using_domain_session() else 'default'
    }
    
    if has_request_context():
        info['has_g_db_session'] = hasattr(g, 'db_session')
        info['g_db_session_is_not_none'] = hasattr(g, 'db_session') and g.db_session is not None
        
        if hasattr(g, 'db_session') and g.db_session is not None:
            info['session_id'] = id(g.db_session)
    
    return info
