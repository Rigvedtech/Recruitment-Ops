"""
Api Model - Uses PostgreSQL ENUMs as the ONLY source of truth.
No hardcoded Python enum classes - all enum values come from the database.
"""
from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid


class Api(db.Model):
    __tablename__ = 'api'
    
    api_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    api_link = db.Column(db.Text, nullable=False)
    api_name = db.Column(db.String(50), nullable=False)  # Uses PostgreSQL enum values as strings
    active = db.Column(db.Boolean, default=True, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # No specific relationships defined as this is a standalone API configuration record
    
    def __repr__(self):
        return f'<Api {self.api_name}>'
    
    def to_dict(self):
        return {
            'api_id': str(self.api_id) if self.api_id else None,
            'api_link': self.api_link,
            'api_name': self.api_name,  # Already a string
            'active': self.active,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
