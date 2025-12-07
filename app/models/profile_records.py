"""
ProfileRecords Model - Uses PostgreSQL ENUMs as the ONLY source of truth.
No hardcoded Python enum classes - all enum values come from the database.
"""
from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid


class ProfileRecords(db.Model):
    __tablename__ = 'profile_records'
    
    profile_record_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    profile_id = db.Column(GUID, db.ForeignKey('profiles.profile_id'), nullable=False)
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=False)
    status = db.Column(db.String(20), nullable=False)  # Uses PostgreSQL enum values as strings
    remark = db.Column(db.Text, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships are already defined in Requirement and Profile models
    
    def __repr__(self):
        return f'<ProfileRecords {self.profile_record_id}>'
    
    def to_dict(self):
        return {
            'profile_record_id': str(self.profile_record_id) if self.profile_record_id else None,
            'profile_id': str(self.profile_id) if self.profile_id else None,
            'requirement_id': str(self.requirement_id) if self.requirement_id else None,
            'status': self.status,  # Already a string
            'remark': self.remark,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
