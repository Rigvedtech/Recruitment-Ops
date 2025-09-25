from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import create_engine, text
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import TypeDecorator, CHAR
import uuid

db = SQLAlchemy()

class GUID(TypeDecorator):
    """Platform-independent GUID type.
    
    Uses PostgreSQL's UUID type when available, otherwise uses
    CHAR(36), storing as stringified hex values.
    """
    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == 'postgresql':
            return str(value) if isinstance(value, uuid.UUID) else value
        else:
            if isinstance(value, uuid.UUID):
                return str(value)
            else:
                # Try to convert string to UUID to validate format, then back to string
                try:
                    return str(uuid.UUID(value))
                except (TypeError, ValueError):
                    return value

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            try:
                value = uuid.UUID(value)
            except (TypeError, ValueError):
                # If it's not a valid UUID string, return as is
                pass
        return value

# PostgreSQL UUID generation function
def postgresql_uuid_default():
    """Return PostgreSQL server default for UUID generation"""
    return text("uuid_generate_v4()")

# Function to set current user context for audit fields
def set_current_user(user_id):
    """Set the current user ID in the database session for audit fields"""
    db.session.execute(text(f"SET app.current_user_id = '{user_id}'"))

def clear_current_user():
    """Clear the current user ID from the database session"""
    db.session.execute(text("SET app.current_user_id = NULL"))

def init_db(app):
    """Initialize the database"""
    db.init_app(app)
    
    # Create tables if they don't exist
    with app.app_context():
        db.create_all()
    
    return db

def create_tables(app):
    """Create database tables manually"""
    with app.app_context():
        db.create_all()
        print("Database tables created successfully!")
    return True 