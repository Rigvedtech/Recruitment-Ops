from datetime import datetime, timedelta
from app.database import db, GUID, postgresql_uuid_default
import uuid
import enum

class StepNameEnum(enum.Enum):
    candidate_submission = "candidate_submission"
    screening = "screening"
    interview_scheduled = "interview_scheduled"
    interview_round_1 = "interview_round_1"
    interview_round_2 = "interview_round_2"
    offered = "offered"
    onboarding = "onboarding"
    open = "open"

class SLAConfig(db.Model):
    __tablename__ = 'sla_config'
    
    sla_config_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    step_name = db.Column(db.Enum(StepNameEnum), nullable=False, unique=True)
    sla_hours = db.Column(db.Integer, nullable=False, default=24)
    sla_days = db.Column(db.Integer, nullable=False, default=1)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    priority = db.Column(db.Integer, default=1, nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # No specific relationships defined as this is a standalone SLA configuration record
    
    def __repr__(self):
        return f'<SLAConfig {self.step_name}: {self.sla_hours}h>'
    
    def to_dict(self):
        return {
            'sla_config_id': str(self.sla_config_id) if self.sla_config_id else None,
            'step_name': self.step_name.value if self.step_name else None,
            'sla_hours': self.sla_hours,
            'sla_days': self.sla_days,
            'is_active': self.is_active,
            'priority': self.priority,
            'description': self.description,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def get_sla_timedelta(self):
        """Get SLA time limit as timedelta"""
        return timedelta(hours=self.sla_hours)
    
    @classmethod
    def get_active_configs(cls):
        """Get all active SLA configurations ordered by priority"""
        return cls.query.filter_by(is_active=True).order_by(cls.priority).all()
    
    @classmethod
    def get_config_by_step(cls, step_name: StepNameEnum):
        """Get SLA configuration for a specific step"""
        return cls.query.filter_by(step_name=step_name.value, is_active=True).first()
    
    @classmethod
    def initialize_default_configs(cls):
        """Initialize default SLA configurations if none exist"""
        if cls.query.count() == 0:
            default_configs = [
                {
                    'step_name': StepNameEnum.open,
                    'sla_hours': 24,
                    'sla_days': 1,
                    'priority': 1,
                    'description': 'Time to start working on the requirement after it is opened'
                },
                {
                    'step_name': StepNameEnum.candidate_submission,
                    'sla_hours': 24,
                    'sla_days': 1,
                    'priority': 2,
                    'description': 'Time to submit candidate profiles after requirement received'
                },
                {
                    'step_name': StepNameEnum.screening,
                    'sla_hours': 48,
                    'sla_days': 2,
                    'priority': 3,
                    'description': 'Time to complete initial screening of candidates'
                },
                {
                    'step_name': StepNameEnum.interview_scheduled,
                    'sla_hours': 48,
                    'sla_days': 2,
                    'priority': 4,
                    'description': 'Time to schedule interviews after screening'
                },
                {
                    'step_name': StepNameEnum.interview_round_1,
                    'sla_hours': 168,
                    'sla_days': 2,
                    'priority': 5,
                    'description': 'Time to complete first round of interviews'
                },
                {
                    'step_name': StepNameEnum.interview_round_2,
                    'sla_hours': 48,
                    'sla_days': 2,
                    'priority': 6,
                    'description': 'Time to complete second round of interviews'
                },
                {
                    'step_name': StepNameEnum.offered,
                    'sla_hours': 48,
                    'sla_days': 2,
                    'priority': 7,
                    'description': 'Time to make offer recommendation after final interview'
                },
                {
                    'step_name': StepNameEnum.onboarding,
                    'sla_hours': 96,
                    'sla_days': 4,
                    'priority': 8,
                    'description': 'Time to complete onboarding process'
                }
            ]
            
            for config_data in default_configs:
                config = cls(**config_data)
                db.session.add(config)
            
            db.session.commit()
