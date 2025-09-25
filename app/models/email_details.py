from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid

class EmailDetails(db.Model):
    __tablename__ = 'email_details'
    
    email_details_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=False)
    thread_id = db.Column(db.String(255), nullable=True)
    email_id = db.Column(db.String(255), nullable=True)
    email_subject = db.Column(db.String(500), nullable=True)
    sender_email = db.Column(db.String(255), nullable=True)
    sender_name = db.Column(db.String(100), nullable=True)
    received_datetime = db.Column(db.DateTime, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships are already defined in Requirement model
    
    def __repr__(self):
        return f'<EmailDetails {self.email_id}>'
    
    def to_dict(self):
        return {
            'email_details_id': str(self.email_details_id) if self.email_details_id else None,
            'requirement_id': str(self.requirement_id) if self.requirement_id else None,
            'thread_id': self.thread_id,
            'email_id': self.email_id,
            'email_subject': self.email_subject,
            'sender_email': self.sender_email,
            'sender_name': self.sender_name,
            'received_datetime': self.received_datetime.isoformat() if self.received_datetime else None,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
