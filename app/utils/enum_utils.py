"""
Central Enum Utility - PostgreSQL as the ONLY source of truth for enums.

This module provides:
1. Fetching enum values directly from PostgreSQL pg_enum catalog
2. Caching for performance (with configurable TTL)
3. Validation helpers
4. No hardcoded enum values - everything comes from the database

Usage:
    from app.utils.enum_utils import EnumRegistry
    
    # Get all values for an enum type
    values = EnumRegistry.get_values('companyenum')
    
    # Check if a value is valid
    is_valid = EnumRegistry.is_valid('companyenum', 'TCS')
    
    # Get enum type name for a field
    enum_name = EnumRegistry.get_enum_name('company')
"""

from functools import lru_cache
from datetime import datetime, timedelta
from typing import List, Optional, Dict
import threading


class EnumRegistry:
    """
    Central registry for PostgreSQL enum values.
    All enum values come from the database - no hardcoding.
    """
    
    # Mapping of friendly names to PostgreSQL enum type names
    # This mapping is the ONLY place where enum type names are defined
    ENUM_TYPE_MAP = {
        # Requirement related
        'company': 'companyenum',
        'department': 'departmentenum',
        'shift': 'shiftenum',
        'job_type': 'jobtypeenum',
        'priority': 'priorityenum',
        'requirement_status': 'requirementstatusenum',
        
        # User related
        'user_role': 'userroleenum',
        
        # Profile related
        'source': 'sourceenum',
        'profile_status': 'profilestatusenum',
        
        # Interview/Workflow related
        'screening_status': 'screeningstatusenum',
        'interview_scheduled_status': 'interviewscheduledstatusenum',
        'interview_round_one_status': 'interviewroundonestatusenum',
        'interview_round_two_status': 'interviewroundtwostatusenum',
        'onboarding_status': 'onboardingstatusenum',
        
        # SLA related
        'sla_status': 'slastatusenum',
        'step_name': 'stepnameenum',
        
        # Meeting related
        'round_type': 'roundtypeenum',
        
        # Notification related
        'notification_type': 'notificationtypeenum',
        
        # System related
        'setting_key': 'settingkeyenum',
        'api_name': 'apinameenum',
    }
    
    # Cache storage
    _cache: Dict[str, List[str]] = {}
    _cache_timestamps: Dict[str, datetime] = {}
    _cache_ttl = timedelta(hours=1)  # Cache for 1 hour
    _lock = threading.Lock()
    
    @classmethod
    def get_db_enum_name(cls, friendly_name: str) -> Optional[str]:
        """
        Get the PostgreSQL enum type name from a friendly name.
        Returns None if not found.
        """
        return cls.ENUM_TYPE_MAP.get(friendly_name.lower())
    
    @classmethod
    def get_values(cls, enum_type: str, force_refresh: bool = False) -> List[str]:
        """
        Get all values for an enum type from PostgreSQL.
        
        Args:
            enum_type: Either a friendly name ('company') or DB name ('companyenum')
            force_refresh: If True, bypass cache and fetch fresh from DB
            
        Returns:
            List of enum values as strings
        """
        # Resolve to DB enum name
        db_enum_name = cls.ENUM_TYPE_MAP.get(enum_type.lower(), enum_type.lower())
        
        # Check cache first (unless force refresh)
        if not force_refresh:
            cached = cls._get_cached(db_enum_name)
            if cached is not None:
                return cached
        
        # Fetch from database
        values = cls._fetch_from_db(db_enum_name)
        
        # Update cache
        cls._set_cache(db_enum_name, values)
        
        return values
    
    @classmethod
    def is_valid(cls, enum_type: str, value: str) -> bool:
        """
        Check if a value is valid for the given enum type.
        
        Args:
            enum_type: Either a friendly name ('company') or DB name ('companyenum')
            value: The value to validate
            
        Returns:
            True if valid, False otherwise
        """
        if not value:
            return False
        values = cls.get_values(enum_type)
        return value in values
    
    @classmethod
    def get_all_enum_types(cls) -> Dict[str, str]:
        """
        Get mapping of all friendly names to DB enum names.
        """
        return cls.ENUM_TYPE_MAP.copy()
    
    @classmethod
    def clear_cache(cls, enum_type: Optional[str] = None):
        """
        Clear the cache for a specific enum type or all types.
        
        Args:
            enum_type: If provided, clear only this type. Otherwise clear all.
        """
        with cls._lock:
            if enum_type:
                db_enum_name = cls.ENUM_TYPE_MAP.get(enum_type.lower(), enum_type.lower())
                cls._cache.pop(db_enum_name, None)
                cls._cache_timestamps.pop(db_enum_name, None)
            else:
                cls._cache.clear()
                cls._cache_timestamps.clear()
    
    @classmethod
    def _get_cached(cls, db_enum_name: str) -> Optional[List[str]]:
        """Get value from cache if not expired."""
        with cls._lock:
            if db_enum_name not in cls._cache:
                return None
            
            timestamp = cls._cache_timestamps.get(db_enum_name)
            if timestamp and datetime.utcnow() - timestamp < cls._cache_ttl:
                return cls._cache[db_enum_name].copy()
            
            # Cache expired
            cls._cache.pop(db_enum_name, None)
            cls._cache_timestamps.pop(db_enum_name, None)
            return None
    
    @classmethod
    def _set_cache(cls, db_enum_name: str, values: List[str]):
        """Set value in cache with timestamp."""
        with cls._lock:
            cls._cache[db_enum_name] = values.copy()
            cls._cache_timestamps[db_enum_name] = datetime.utcnow()
    
    @classmethod
    def _fetch_from_db(cls, db_enum_name: str) -> List[str]:
        """
        Fetch enum values directly from PostgreSQL pg_enum catalog.
        """
        from flask import current_app, g
        from app.database import db
        from sqlalchemy import text
        
        try:
            # Get the appropriate session
            def get_session():
                try:
                    if hasattr(g, 'db_session') and g.db_session is not None:
                        if hasattr(g.db_session, 'execute'):
                            return g.db_session
                    return db.session
                except Exception:
                    return db.session
            
            session = get_session()
            
            query = text("""
                SELECT enumlabel 
                FROM pg_enum 
                WHERE enumtypid = (
                    SELECT oid FROM pg_type WHERE typname = :enum_type
                ) 
                ORDER BY enumsortorder
            """)
            
            result = session.execute(query, {'enum_type': db_enum_name}).fetchall()
            return [row[0] for row in result]
            
        except Exception as e:
            # Log the error but don't crash - return empty list
            try:
                current_app.logger.error(f"Error fetching enum values for {db_enum_name}: {str(e)}")
            except Exception:
                pass
            return []
    
    @classmethod
    def validate_or_raise(cls, enum_type: str, value: str, field_name: str = None):
        """
        Validate a value against an enum type, raising ValueError if invalid.
        
        Args:
            enum_type: The enum type to validate against
            value: The value to validate
            field_name: Optional field name for better error messages
        """
        if not cls.is_valid(enum_type, value):
            valid_values = cls.get_values(enum_type)
            field_str = f" for field '{field_name}'" if field_name else ""
            raise ValueError(
                f"Invalid value '{value}'{field_str}. "
                f"Valid values are: {', '.join(valid_values)}"
            )


# Convenience functions for common operations
def get_enum_values(enum_type: str) -> List[str]:
    """Get all values for an enum type."""
    return EnumRegistry.get_values(enum_type)


def is_valid_enum_value(enum_type: str, value: str) -> bool:
    """Check if a value is valid for an enum type."""
    return EnumRegistry.is_valid(enum_type, value)


def validate_enum_value(enum_type: str, value: str, field_name: str = None):
    """Validate an enum value, raising ValueError if invalid."""
    return EnumRegistry.validate_or_raise(enum_type, value, field_name)

