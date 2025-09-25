from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid
import enum

class SourceEnum(enum.Enum):
    naukri_com = "naukri_com"
    monster_india = "monster_india"
    timesjobs = "timesjobs"
    shine_com = "shine_com"
    freshersworld = "freshersworld"
    github_stackoverflow = "github_stackoverflow"
    internshala = "internshala"

class ProfileStatusEnum(enum.Enum):
    onboarded = "onboarded"
    rejected = "rejected"
    selected = "selected"

class Profile(db.Model):
    __tablename__ = 'profiles'

    profile_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    student_id = db.Column(db.String(20), unique=True, nullable=True)  # Display ID for frontend
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=True)
    candidate_name = db.Column(db.String(100), nullable=False)
    total_experience = db.Column(db.Numeric(5, 2), nullable=True)
    relevant_experience = db.Column(db.Numeric(5, 2), nullable=True)
    current_company = db.Column(db.String(100), nullable=True)
    ctc_current = db.Column(db.Numeric(10, 2), nullable=True)
    ctc_expected = db.Column(db.Numeric(10, 2), nullable=True)
    notice_period_days = db.Column(db.Integer, nullable=True)
    location = db.Column(db.String(100), nullable=True)
    education = db.Column(db.Text, nullable=True)
    key_skills = db.Column(db.Text, nullable=True)  # Skills as text for frontend compatibility
    skill_id = db.Column(GUID, db.ForeignKey('skills.skill_id'), nullable=True)
    source = db.Column(db.Enum(SourceEnum), nullable=True)
    email_id = db.Column(db.String(255), nullable=True)
    contact_no = db.Column(db.Numeric(10, 0), nullable=True)
    resume_file_path = db.Column(db.String(500), nullable=True)
    resume_file_name = db.Column(db.String(255), nullable=True)
    status = db.Column(db.Enum(ProfileStatusEnum), nullable=True)
    remark = db.Column(db.Text, nullable=True)
    created_by_recruiter = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    profile_records = db.relationship('ProfileRecords', backref='profile', lazy=True, foreign_keys='ProfileRecords.profile_id')
    screening = db.relationship('Screening', backref='profile', lazy=True, foreign_keys='Screening.profile_id')
    interview_scheduled = db.relationship('InterviewScheduled', backref='profile', lazy=True, foreign_keys='InterviewScheduled.profile_id')
    interview_round_one = db.relationship('InterviewRoundOne', backref='profile', lazy=True, foreign_keys='InterviewRoundOne.profile_id')
    interview_round_two = db.relationship('InterviewRoundTwo', backref='profile', lazy=True, foreign_keys='InterviewRoundTwo.profile_id')
    offers = db.relationship('Offer', backref='profile', lazy=True, foreign_keys='Offer.profile_id')
    meetings = db.relationship('Meeting', backref='profile', lazy=True, foreign_keys='Meeting.profile_id')

    def __repr__(self):
        return f'<Profile {self.candidate_name}>'

    def to_dict(self):
        return {
            'profile_id': str(self.profile_id) if self.profile_id else None,
            'student_id': self.student_id,
            'requirement_id': str(self.requirement_id) if self.requirement_id else None,
            'candidate_name': self.candidate_name,
            'total_experience': float(self.total_experience) if self.total_experience else None,
            'relevant_experience': float(self.relevant_experience) if self.relevant_experience else None,
            'current_company': self.current_company,
            'ctc_current': float(self.ctc_current) if self.ctc_current else None,
            'ctc_expected': float(self.ctc_expected) if self.ctc_expected else None,
            'notice_period_days': self.notice_period_days,
            'location': self.location,
            'education': self.education,
            'key_skills': self.key_skills,
            'skill_id': str(self.skill_id) if self.skill_id else None,
            'source': self.source.value if self.source else None,
            'email_id': self.email_id,
            'contact_no': str(self.contact_no) if self.contact_no else None,
            'resume_file_path': self.resume_file_path,
            'resume_file_name': self.resume_file_name,
            'status': self.status.value if self.status else None,
            'remark': self.remark,
            'created_by_recruiter': str(self.created_by_recruiter) if self.created_by_recruiter else None,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        } 