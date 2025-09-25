from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid

class Skills(db.Model):
    __tablename__ = 'skills'
    
    skill_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    skill_name = db.Column(db.String(100), unique=True, nullable=False)
    skill_category = db.Column(db.String(50), nullable=True)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    requirements = db.relationship('Requirement', backref='skill', lazy=True, foreign_keys='Requirement.skill_id')
    profiles = db.relationship('Profile', backref='skill', lazy=True, foreign_keys='Profile.skill_id')
    
    def __repr__(self):
        return f'<Skills {self.skill_name}>'
    
    def to_dict(self):
        return {
            'skill_id': str(self.skill_id) if self.skill_id else None,
            'skill_name': self.skill_name,
            'skill_category': self.skill_category,
            'description': self.description,
            'is_active': self.is_active,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
