# DEPRECATED: This model is part of the legacy SQLite system
# The new PostgreSQL schema uses a different approach for tracking
# This file is kept for backward compatibility but should not be used in new code
# TODO: Remove this file after migration is complete

from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid

class Tracker(db.Model):
    __tablename__ = 'tracker'
    
    id = db.Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=False)
    profile_id = db.Column(GUID, db.ForeignKey('profiles.profile_id'), nullable=False)
    
    # Keep original identifiers for reference
    request_id = db.Column(db.String(20), nullable=True)  # Legacy field for compatibility
    student_id = db.Column(db.String(50), nullable=True)  # Legacy field for compatibility
    
    # Additional tracking fields
    extracted_at = db.Column(db.DateTime, default=datetime.utcnow)
    email_id = db.Column(db.String(255), nullable=True)  # Reference to the original email
    onboarded = db.Column(db.Boolean, default=False)  # Individual onboarding status
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    requirement = db.relationship('Requirement', backref='tracked_profiles', lazy=True, foreign_keys=[requirement_id])
    profile = db.relationship('Profile', backref='tracked_requirements', lazy=True, foreign_keys=[profile_id])
    
    # Unique constraint to prevent duplicate entries
    __table_args__ = (db.UniqueConstraint('requirement_id', 'profile_id', name='unique_requirement_profile'),)
    
    def __repr__(self):
        return f'<Tracker {self.request_id} -> {self.student_id}>'
    
    def to_dict(self):
        return {
            'id': str(self.id) if self.id else None,
            'requirement_id': str(self.requirement_id) if self.requirement_id else None,
            'profile_id': str(self.profile_id) if self.profile_id else None,
            'request_id': self.request_id,  # Legacy field
            'student_id': self.student_id,  # Legacy field
            'extracted_at': self.extracted_at.isoformat() if self.extracted_at else None,
            'email_id': self.email_id,
            'onboarded': self.onboarded,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def get_student_ids_list(self):
        """Get list of student IDs for this tracker entry (for compatibility with old grouped structure)"""
        # Since this is an individual student row, return a list with just this student_id
        return [self.student_id]
    
    def get_student_count(self):
        """Get student count for this tracker entry (for compatibility with old grouped structure)"""
        # Since this is an individual student row, return 1
        return 1
    
    @classmethod
    def get_students_for_request(cls, request_id: str):
        """Get all students tracked for a specific request"""
        return cls.query.filter_by(request_id=request_id).all()
    
    @classmethod
    def get_requests_for_student(cls, student_id: str):
        """Get all requests tracked for a specific student"""
        return cls.query.filter_by(student_id=student_id).all()
    
    @classmethod
    def get_student_count_for_request(cls, request_id: str) -> int:
        """Get the number of students tracked for a specific request"""
        return cls.query.filter_by(request_id=request_id).count()
    
    @classmethod
    def get_onboarded_count_for_request(cls, request_id: str) -> int:
        """Get the number of onboarded students for a specific request"""
        return cls.query.filter_by(request_id=request_id, onboarded=True).count()
    
    @classmethod
    def get_onboarded_students_for_request(cls, request_id: str):
        """Get all onboarded students for a specific request"""
        return cls.query.filter_by(request_id=request_id, onboarded=True).all()
    
    @classmethod
    def get_all_student_ids_for_request(cls, request_id: str):
        """Get all student IDs for a specific request as a list"""
        tracker_entries = cls.query.filter_by(request_id=request_id).all()
        return [entry.student_id for entry in tracker_entries]
    
    @classmethod
    def update_onboarding_status(cls, request_id: str, student_id: str, onboarded: bool) -> bool:
        """Update onboarding status for a specific student-requirement pair"""
        try:
            tracker_entry = cls.query.filter_by(request_id=request_id, student_id=student_id).first()
            if tracker_entry:
                tracker_entry.onboarded = onboarded
                tracker_entry.updated_at = datetime.utcnow()
                db.session.commit()
                return True
            return False
        except Exception as e:
            db.session.rollback()
            return False 