from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid
import enum

class InterviewRoundTwoStatusEnum(enum.Enum):
    select = "select"
    reject = "reject"
    reschedule = "reschedule"

class InterviewRoundTwo(db.Model):
    __tablename__ = 'interview_round_two'
    __table_args__ = (
        db.UniqueConstraint('requirement_id', 'profile_id', name='uq_interview_round_two_requirement_profile'),
    )
    
    interview_round_two_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=False)
    profile_id = db.Column(GUID, db.ForeignKey('profiles.profile_id'), nullable=False)
    meeting_id = db.Column(GUID, db.ForeignKey('meetings.meeting_id'), nullable=True)
    start_time = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.Enum(InterviewRoundTwoStatusEnum), nullable=False)
    status_timestamp = db.Column(db.DateTime, nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)
    remark = db.Column(db.Text, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships are already defined in Requirement, Profile, and Meeting models
    
    def __repr__(self):
        return f'<InterviewRoundTwo {self.interview_round_two_id}>'
    
    def to_dict(self):
        return {
            'interview_round_two_id': str(self.interview_round_two_id) if self.interview_round_two_id else None,
            'requirement_id': str(self.requirement_id) if self.requirement_id else None,
            'profile_id': str(self.profile_id) if self.profile_id else None,
            'meeting_id': str(self.meeting_id) if self.meeting_id else None,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'status': self.status.value if self.status else None,
            'status_timestamp': self.status_timestamp.isoformat() if self.status_timestamp else None,
            'active': self.active,
            'remark': self.remark,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
