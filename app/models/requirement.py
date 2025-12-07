"""
Requirement Model - Uses PostgreSQL ENUMs as the ONLY source of truth.
No hardcoded Python enum classes - all enum values come from the database.
"""
from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid
from sqlalchemy import event, text, String
from sqlalchemy.dialects.postgresql import ENUM


def format_enum_for_display(value):
    """Convert database enum values to user-friendly display format"""
    if not value:
        return value
    # Replace underscores with spaces and title case each word
    return value.replace('_', ' ').title()


# PostgreSQL ENUM types - these reference existing DB enum types
# create_type=False because they already exist in the database
RequirementStatusType = ENUM(
    'Open', 'Candidate_Submission', 'Interview_Scheduled', 
    'Offer_Recommendation', 'On_Boarding', 'On_Hold', 'Closed', 'Cancelled',
    name='requirementstatusenum',
    create_type=False
)

DepartmentType = ENUM(
    name='departmentenum',
    create_type=False
)

CompanyType = ENUM(
    name='companyenum', 
    create_type=False
)

ShiftType = ENUM(
    name='shiftenum',
    create_type=False
)

JobTypeType = ENUM(
    name='jobtypeenum',
    create_type=False
)

PriorityType = ENUM(
    name='priorityenum',
    create_type=False
)


class Requirement(db.Model):
    __tablename__ = 'requirements'
    
    requirement_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    request_id = db.Column(db.String(10), unique=True, index=True, nullable=False)
    job_title = db.Column(db.String(255), nullable=True)
    department = db.Column(db.String(50), nullable=True)  # Stores PostgreSQL enum values as strings
    location = db.Column(db.String(150), nullable=True)
    company_name = db.Column(db.String(50), nullable=True)  # Stores PostgreSQL enum values as strings
    shift = db.Column(db.String(20), nullable=True)  # Stores PostgreSQL enum values as strings
    job_type = db.Column(db.String(20), nullable=True)  # Stores PostgreSQL enum values as strings
    hiring_manager = db.Column(db.String(100), nullable=True)
    experience_range = db.Column(db.String(50), nullable=True)
    skill_id = db.Column(GUID, db.ForeignKey('skills.skill_id'), nullable=True)
    minimum_qualification = db.Column(db.Text, nullable=True)
    number_of_positions = db.Column(db.Integer, nullable=True)
    budget_ctc = db.Column(db.String(50), nullable=True)
    priority = db.Column(db.String(20), nullable=True)  # Stores PostgreSQL enum values as strings
    tentative_doj = db.Column(db.Date, nullable=True)
    additional_remarks = db.Column(db.Text, nullable=True)
    job_description = db.Column(db.Text, nullable=True)  # Extracted text from JD file
    jd_path = db.Column(db.String(500), nullable=True)  # File path to uploaded JD
    job_file_name = db.Column(db.String(255), nullable=True)  # Original filename of JD
    status = db.Column(db.String(50), default='Open', nullable=False)  # Uses PostgreSQL enum values as strings
    user_id = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    closed_at = db.Column(db.DateTime, nullable=True)
    is_manual_requirement = db.Column(db.Boolean, default=False, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    # Job posting tracking fields
    is_job_posted = db.Column(db.Boolean, default=False, nullable=False)
    job_posted_at = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    profiles = db.relationship('Profile', backref='requirement', lazy=True, foreign_keys='Profile.requirement_id')
    email_details = db.relationship('EmailDetails', backref='requirement', lazy=True, foreign_keys='EmailDetails.requirement_id')
    profile_records = db.relationship('ProfileRecords', backref='requirement', lazy=True, foreign_keys='ProfileRecords.requirement_id')
    screening = db.relationship('Screening', backref='requirement', lazy=True, foreign_keys='Screening.requirement_id')
    interview_scheduled = db.relationship('InterviewScheduled', backref='requirement', lazy=True, foreign_keys='InterviewScheduled.requirement_id')
    interview_round_one = db.relationship('InterviewRoundOne', backref='requirement', lazy=True, foreign_keys='InterviewRoundOne.requirement_id')
    interview_round_two = db.relationship('InterviewRoundTwo', backref='requirement', lazy=True, foreign_keys='InterviewRoundTwo.requirement_id')
    offers = db.relationship('Offer', backref='requirement', lazy=True, foreign_keys='Offer.requirement_id')
    sla_tracking = db.relationship('SLATracker', backref='requirement', lazy=True, foreign_keys='SLATracker.requirement_id')
    
    def __repr__(self):
        return f'<Requirement {self.requirement_id}>'
    
    def close_requirement(self):
        """Close the requirement and set closed_at timestamp"""
        self.status = 'Closed'  # String value from PostgreSQL enum
        self.closed_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
    
    def soft_delete(self, deleted_by_user=None):
        """Mark requirement as soft deleted"""
        self.is_deleted = True
        self.deleted_at = datetime.utcnow()
        self.deleted_by = deleted_by_user
        self.updated_at = datetime.utcnow()
    
    def restore(self):
        """Restore a soft deleted requirement"""
        self.is_deleted = False
        self.deleted_at = None
        self.deleted_by = None
        self.updated_at = datetime.utcnow()
    
    @classmethod
    def query_active(cls):
        """Query only non-deleted requirements"""
        return cls.query.filter_by(is_deleted=False)
    
    @classmethod
    def query_with_deleted(cls):
        """Query all requirements including deleted ones"""
        return cls.query
    
    @classmethod
    def query_deleted_only(cls):
        """Query only soft-deleted requirements"""
        return cls.query.filter_by(is_deleted=True)
    
    def get_overall_time(self):
        """Calculate overall time from creation to closure"""
        if not self.closed_at:
            return None
        
        time_diff = self.closed_at - self.created_at
        days = time_diff.days
        hours = time_diff.seconds // 3600
        
        if days > 0:
            return f"{days} Days {hours} hours"
        else:
            return f"{hours} hours"
    
    def is_assigned_to(self, username, session=None):
        """Check if a user (by username) is assigned to this requirement"""
        from app.models.assignment import Assignment
        from app.models.user import User
        
        # Use provided session or fall back to default
        if session is None:
            session = db.session
        
        # First, get the user by username
        user = session.query(User).filter_by(username=username).first()
        if not user:
            return False
        
        # Check if there's an active assignment for this user and requirement
        assignment = session.query(Assignment).filter_by(
            requirement_id=self.requirement_id,
            user_id=user.user_id,
            is_active=True
        ).first()
        
        return assignment is not None
    
    def to_dict(self):
        """Convert to dictionary - all enum values returned as raw strings for frontend dropdown matching"""
        return {
            'requirement_id': str(self.requirement_id) if self.requirement_id else None,
            'request_id': self.request_id,
            'job_title': self.job_title,
            'department': self.department,  # Raw value for dropdown matching
            'location': self.location,
            'company_name': self.company_name,  # Raw value for dropdown matching
            'shift': self.shift,  # Raw value for dropdown matching
            'job_type': self.job_type,  # Raw value for dropdown matching
            'hiring_manager': self.hiring_manager,
            'experience_range': self.experience_range,
            'skill_id': str(self.skill_id) if self.skill_id else None,
            'minimum_qualification': self.minimum_qualification,
            'number_of_positions': self.number_of_positions,
            'budget_ctc': self.budget_ctc,
            'priority': self.priority,  # Raw value for dropdown matching
            'tentative_doj': self.tentative_doj.isoformat() if self.tentative_doj else None,
            'additional_remarks': self.additional_remarks,
            'job_description': self.job_description,
            'jd_path': self.jd_path,
            'job_file_name': self.job_file_name,
            'status': self.status,  # Already a string
            'user_id': str(self.user_id) if self.user_id else None,
            'notes': self.notes,
            'closed_at': self.closed_at.isoformat() if self.closed_at else None,
            'overall_time': self.get_overall_time(),
            'is_manual_requirement': self.is_manual_requirement,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_job_posted': self.is_job_posted,
            'job_posted_at': self.job_posted_at.isoformat() if self.job_posted_at else None
        } 


# Auto-generate a unique request_id like "Req010" before insert
@event.listens_for(Requirement, 'before_insert')
def set_request_id(mapper, connection, target):
    if getattr(target, 'request_id', None):
        return
    # PostgreSQL-compatible query to get the max numeric suffix after 'Req'
    result = connection.execute(
        text(
            """
            SELECT COALESCE(MAX(CAST(SUBSTRING(request_id, 4) AS INTEGER)), 0)
            FROM requirements
            WHERE request_id LIKE 'Req%'
            """
        )
    ).scalar()
    next_num = (result or 0) + 1
    target.request_id = f"Req{next_num:03d}"
