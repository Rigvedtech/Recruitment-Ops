# DEPRECATED: This model is part of the legacy SQLite system
# The new PostgreSQL schema uses a different approach for status tracking
# This file is kept for backward compatibility but should not be used in new code
# TODO: Remove this file after migration is complete

from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid

class StatusTracker(db.Model):
    __tablename__ = 'status_tracker'
    
    id = db.Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=False)
    request_id = db.Column(db.String(20), nullable=True)  # Keep for reference
    status = db.Column(db.String(50), nullable=False)  # The status that was set
    previous_status = db.Column(db.String(50), nullable=True)  # Previous status (if any)
    
    # Timestamps
    status_changed_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Additional metadata
    email_id = db.Column(db.String(255), nullable=True)  # Email that triggered the status change
    email_subject = db.Column(db.Text, nullable=True)  # Subject of the email
    category_detected = db.Column(db.String(50), nullable=True)  # Category that was detected
    notes = db.Column(db.Text, nullable=True)  # Additional notes about the status change
    
    # Relationships
    requirement = db.relationship('Requirement', backref='status_history', lazy=True, foreign_keys=[requirement_id])
    
    def __repr__(self):
        return f'<StatusTracker {self.request_id}: {self.previous_status} -> {self.status} at {self.status_changed_at}>'
    
    def to_dict(self):
        return {
            'id': str(self.id) if self.id else None,
            'requirement_id': str(self.requirement_id) if self.requirement_id else None,
            'request_id': self.request_id,
            'status': self.status,
            'previous_status': self.previous_status,
            'status_changed_at': self.status_changed_at.isoformat() if self.status_changed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'email_id': self.email_id,
            'email_subject': self.email_subject,
            'category_detected': self.category_detected,
            'notes': self.notes
        }
    
    @classmethod
    def add_status_change(cls, request_id: str, status: str, previous_status: str = None, 
                         email_id: str = None, email_subject: str = None, 
                         category_detected: str = None, notes: str = None, auto_commit: bool = True):
        """
        Add a new status change record
        
        Args:
            auto_commit: If True, commits the transaction. If False, just adds to session.
        """
        status_record = cls(
            request_id=request_id,
            status=status,
            previous_status=previous_status,
            email_id=email_id,
            email_subject=email_subject,
            category_detected=category_detected,
            notes=notes
        )
        db.session.add(status_record)
        if auto_commit:
            db.session.commit()
        return status_record
    
    @classmethod
    def get_status_history(cls, request_id: str):
        """
        Get complete status history for a request_id
        """
        return cls.query.filter_by(request_id=request_id).order_by(cls.status_changed_at.asc()).all()
    
    @classmethod
    def get_latest_status(cls, request_id: str):
        """
        Get the latest status for a request_id
        """
        return cls.query.filter_by(request_id=request_id).order_by(cls.status_changed_at.desc()).first() 