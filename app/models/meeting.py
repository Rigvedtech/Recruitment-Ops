from datetime import datetime
from typing import Dict, Optional

from app.database import db, GUID, postgresql_uuid_default
import uuid
import enum

class RoundTypeEnum(enum.Enum):
    interview_scheduled = "interview_scheduled"
    interview_round_1 = "interview_round_1"
    interview_round_2 = "interview_round_2"
    # Legacy values for backward compatibility
    round1 = "round1"
    round2 = "round2"

class Meeting(db.Model):
    __tablename__ = 'meetings'

    meeting_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    profile_id = db.Column(GUID, db.ForeignKey('profiles.profile_id'), nullable=True)
    round_type = db.Column(db.Enum(RoundTypeEnum), nullable=False, default=RoundTypeEnum.interview_scheduled)
    meet_link = db.Column(db.Text, nullable=False)
    start_time = db.Column(db.DateTime, nullable=True)
    end_time = db.Column(db.DateTime, nullable=True)
    subject = db.Column(db.String(255), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    interview_scheduled = db.relationship('InterviewScheduled', backref='meeting', lazy=True, foreign_keys='InterviewScheduled.meeting_id')
    interview_round_one = db.relationship('InterviewRoundOne', backref='meeting', lazy=True, foreign_keys='InterviewRoundOne.meeting_id')
    interview_round_two = db.relationship('InterviewRoundTwo', backref='meeting', lazy=True, foreign_keys='InterviewRoundTwo.meeting_id')

    def to_dict(self) -> Dict:
        return {
            'meeting_id': str(self.meeting_id) if self.meeting_id else None,
            'profile_id': str(self.profile_id) if self.profile_id else None,
            'round_type': self.round_type.value if self.round_type else None,
            'meet_link': self.meet_link,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'subject': self.subject,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @classmethod
    def normalize_round_type(cls, round_type: str) -> str:
        """Normalize round type values for backward compatibility"""
        if round_type == "round1":
            return "interview_round_1"
        elif round_type == "round2":
            return "interview_round_2"
        return round_type

    @classmethod
    def get_for_request(cls, request_id: str, round_type: str = None):
        """Get all meetings for a request, grouped by candidate"""
        from app.models.profile import Profile
        from app.models.requirement import Requirement
        
        # Get requirement
        requirement = Requirement.query.filter_by(request_id=request_id).first()
        if not requirement:
            return {}
        
        # Build query
        query = cls.query.join(Profile).filter(
            Profile.requirement_id == requirement.requirement_id,
            cls.is_deleted == False
        )
        
        if round_type:
            normalized_round_type = cls.normalize_round_type(round_type)
            query = query.filter(cls.round_type == normalized_round_type)
        
        meetings = query.all()
        
        # Group by candidate (student_id)
        result = {}
        for meeting in meetings:
            if meeting.profile and meeting.profile.student_id:
                candidate_id = meeting.profile.student_id
                result[candidate_id] = {
                    'meet_link': meeting.meet_link,
                    'start_time': meeting.start_time.isoformat() if meeting.start_time else None,
                    'end_time': meeting.end_time.isoformat() if meeting.end_time else None,
                    'subject': meeting.subject,
                    'round_type': meeting.round_type.value
                }
        
        return result

    @classmethod
    def get_for_candidate(cls, request_id: str, candidate_id: str, round_type: str = None):
        """Get meeting for a specific candidate"""
        from app.models.profile import Profile
        from app.models.requirement import Requirement
        
        # Get requirement
        requirement = Requirement.query.filter_by(request_id=request_id).first()
        if not requirement:
            return None
        
        # Build query
        query = cls.query.join(Profile).filter(
            Profile.requirement_id == requirement.requirement_id,
            Profile.student_id == candidate_id,
            cls.is_deleted == False
        )
        
        if round_type:
            normalized_round_type = cls.normalize_round_type(round_type)
            query = query.filter(cls.round_type == normalized_round_type)
        
        meeting = query.first()
        
        if meeting:
            return {
                'meet_link': meeting.meet_link,
                'start_time': meeting.start_time.isoformat() if meeting.start_time else None,
                'end_time': meeting.end_time.isoformat() if meeting.end_time else None,
                'subject': meeting.subject,
                'round_type': meeting.round_type.value
            }
        
        return None

    @classmethod
    def upsert(cls, request_id: str, candidate_id: str, round_type: str, meet_link: str, 
               start_time=None, end_time=None, timezone='UTC', subject=None):
        """Create or update a meeting"""
        from app.models.profile import Profile
        from app.models.requirement import Requirement
        
        # Get requirement and profile
        requirement = Requirement.query.filter_by(request_id=request_id).first()
        if not requirement:
            return None
            
        profile = Profile.query.filter(
            Profile.requirement_id == requirement.requirement_id,
            Profile.student_id == candidate_id
        ).first()
        if not profile:
            return None
        
        # Check if meeting exists
        normalized_round_type = cls.normalize_round_type(round_type)
        existing = cls.query.filter(
            cls.profile_id == profile.profile_id,
            cls.round_type == normalized_round_type,
            cls.is_deleted == False
        ).first()
        
        if existing:
            # Update existing
            existing.meet_link = meet_link
            existing.start_time = start_time
            existing.end_time = end_time
            existing.subject = subject
            existing.updated_at = datetime.utcnow()
            meeting = existing
        else:
            # Create new
            meeting = cls(
                profile_id=profile.profile_id,
                round_type=normalized_round_type,
                meet_link=meet_link,
                start_time=start_time,
                end_time=end_time,
                subject=subject
            )
            db.session.add(meeting)
        
        db.session.commit()
        return meeting


