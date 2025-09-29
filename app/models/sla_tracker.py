from datetime import datetime, timedelta
from app.database import db, GUID, postgresql_uuid_default
from app.models.sla_config import StepNameEnum
from flask import g
import uuid
import enum

class SLAStatusEnum(enum.Enum):
    pending = "pending"
    completed = "completed"
    breached = "breached"
    cancelled = "cancelled"

class SLATracker(db.Model):
    __tablename__ = 'sla_tracker'
    
    sla_tracker_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=False)
    step_name = db.Column(db.Enum(StepNameEnum), nullable=False)
    step_started_at = db.Column(db.DateTime, nullable=False)
    step_completed_at = db.Column(db.DateTime, nullable=True)
    sla_hours = db.Column(db.Integer, nullable=False)
    sla_days = db.Column(db.Integer, nullable=False)
    actual_duration_hours = db.Column(db.Numeric(10, 2), nullable=True)
    actual_duration_days = db.Column(db.Numeric(10, 2), nullable=True)
    sla_status = db.Column(db.Enum(SLAStatusEnum), nullable=True)
    sla_breach_hours = db.Column(db.Numeric(10, 2), nullable=True)
    user_id = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships are defined in the Requirement model to avoid conflicts
    
    @classmethod
    def get_db_session(cls):
        """Get the correct database session for the current domain"""
        try:
            if hasattr(g, 'db_session') and g.db_session is not None:
                if hasattr(g.db_session, 'query'):
                    return g.db_session
            return db.session
        except Exception:
            return db.session
    
    def __repr__(self):
        return f'<SLATracker {self.requirement_id}:{self.step_name.value if self.step_name else None} - {self.sla_status.value if self.sla_status else None}>'
    
    def to_dict(self):
        return {
            'sla_tracker_id': str(self.sla_tracker_id) if self.sla_tracker_id else None,
            'requirement_id': str(self.requirement_id) if self.requirement_id else None,
            'step_name': self.step_name.value if self.step_name else None,
            'step_started_at': self.step_started_at.isoformat() if self.step_started_at else None,
            'step_completed_at': self.step_completed_at.isoformat() if self.step_completed_at else None,
            'sla_hours': self.sla_hours,
            'sla_days': self.sla_days,
            'actual_duration_hours': float(self.actual_duration_hours) if self.actual_duration_hours else None,
            'actual_duration_days': float(self.actual_duration_days) if self.actual_duration_days else None,
            'sla_status': self.sla_status.value if self.sla_status else None,
            'sla_breach_hours': float(self.sla_breach_hours) if self.sla_breach_hours else None,
            'user_id': str(self.user_id) if self.user_id else None,
            'notes': self.notes,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def calculate_sla_metrics(self):
        """Calculate SLA metrics based on current state"""
        if not self.step_started_at:
            return
        
        # Calculate actual duration
        end_time = self.step_completed_at or datetime.utcnow()
        duration = end_time - self.step_started_at
        
        self.actual_duration_hours = duration.total_seconds() / 3600
        self.actual_duration_days = self.actual_duration_hours / 24
        
        # Calculate SLA status and breach hours
        if self.step_completed_at:
            # Step is completed, check if it was on time
            if self.actual_duration_hours <= self.sla_hours:
                self.sla_status = SLAStatusEnum.completed
                self.sla_breach_hours = 0
            else:
                self.sla_status = SLAStatusEnum.breached
                self.sla_breach_hours = self.actual_duration_hours - self.sla_hours
        else:
            # Step is still in progress, check if it's currently breaching
            if self.actual_duration_hours > self.sla_hours:
                self.sla_status = SLAStatusEnum.breached
                self.sla_breach_hours = self.actual_duration_hours - self.sla_hours
            else:
                self.sla_status = SLAStatusEnum.pending
                self.sla_breach_hours = 0  # No breach yet
    
    def complete_step(self, completion_time: datetime = None):
        """Mark step as completed and calculate final SLA metrics"""
        self.step_completed_at = completion_time or datetime.utcnow()
        self.calculate_sla_metrics()
        self.updated_at = datetime.utcnow()
    
    def is_breaching(self) -> bool:
        """Check if the step is currently breaching SLA"""
        if not self.step_started_at:
            return False
        
        current_duration = (datetime.utcnow() - self.step_started_at).total_seconds() / 3600
        return current_duration > self.sla_hours
    
    def get_remaining_time(self) -> timedelta:
        """Get remaining time before SLA breach (negative if already breached)"""
        if not self.step_started_at:
            return timedelta(hours=self.sla_hours)
        
        elapsed = datetime.utcnow() - self.step_started_at
        remaining = timedelta(hours=self.sla_hours) - elapsed
        return remaining
    
    @classmethod
    def start_step(cls, requirement_id: str, step_name: StepNameEnum, 
                   sla_hours: int, sla_days: int, user_id: str = None, 
                   notes: str = None):
        """Start tracking a new step"""
        # Check if step is already being tracked
        session = cls.get_db_session()
        existing = session.query(cls).filter_by(
            requirement_id=requirement_id, 
            step_name=step_name.value,
            step_completed_at=None
        ).first()
        
        if existing:
            return existing  # Return existing tracker if step is already in progress
        
        tracker = cls(
            requirement_id=requirement_id,
            step_name=step_name,
            step_started_at=datetime.utcnow(),
            sla_hours=sla_hours,
            sla_days=sla_days,
            user_id=user_id,
            notes=notes,
            sla_status=SLAStatusEnum.pending
        )
        
        session.add(tracker)
        session.commit()
        return tracker
    
    @classmethod
    def complete_step(cls, requirement_id: str, step_name: StepNameEnum, completion_time: datetime = None):
        """Complete a step and calculate SLA metrics"""
        session = cls.get_db_session()
        tracker = session.query(cls).filter_by(
            requirement_id=requirement_id,
            step_name=step_name.value,
            step_completed_at=None
        ).first()
        
        if tracker:
            tracker.complete_step(completion_time)
            session.commit()
        
        return tracker
    
    @classmethod
    def get_active_steps(cls, requirement_id: str):
        """Get all active (in-progress) steps for a requirement"""
        session = cls.get_db_session()
        return session.query(cls).filter_by(
            requirement_id=requirement_id,
            step_completed_at=None
        ).order_by(cls.step_started_at).all()
    
    @classmethod
    def get_completed_steps(cls, requirement_id: str):
        """Get all completed steps for a requirement"""
        session = cls.get_db_session()
        return session.query(cls).filter(
            cls.requirement_id == requirement_id,
            cls.step_completed_at.isnot(None)
        ).order_by(cls.step_completed_at).all()
    
    @classmethod
    def get_all_steps(cls, requirement_id: str):
        """Get all steps (active and completed) for a requirement"""
        session = cls.get_db_session()
        return session.query(cls).filter_by(requirement_id=requirement_id).order_by(cls.step_started_at).all()
    
    @classmethod
    def get_breaching_steps(cls):
        """Get all steps that are currently breaching SLA"""
        session = cls.get_db_session()
        active_steps = session.query(cls).filter_by(step_completed_at=None).all()
        breaching_steps = []
        
        for step in active_steps:
            if step.is_breaching():
                breaching_steps.append(step)
        
        return breaching_steps
    
    @classmethod
    def update_in_progress_metrics(cls):
        """Update SLA metrics for all in-progress steps in real-time"""
        session = cls.get_db_session()
        in_progress_steps = session.query(cls).filter_by(step_completed_at=None).all()
        
        for step in in_progress_steps:
            step.calculate_sla_metrics()
        
        session.commit()
        return len(in_progress_steps)
    
    @classmethod
    def get_sla_metrics(cls, requirement_id: str = None, step_name: StepNameEnum = None):
        """Get SLA metrics for analysis"""
        query = cls.query
        
        if requirement_id:
            query = query.filter_by(requirement_id=requirement_id)
        
        if step_name:
            query = query.filter_by(step_name=step_name.value)
        
        completed_steps = query.filter(cls.step_completed_at.isnot(None)).all()
        
        if not completed_steps:
            return {
                'total_steps': 0,
                'on_time_steps': 0,
                'breached_steps': 0,
                'compliance_percentage': 0,
                'average_duration_hours': 0,
                'average_duration_days': 0,
                'total_breach_hours': 0
            }
        
        total_steps = len(completed_steps)
        on_time_steps = len([s for s in completed_steps if s.sla_status == SLAStatusEnum.completed])
        breached_steps = len([s for s in completed_steps if s.sla_status == SLAStatusEnum.breached])
        
        total_duration_hours = sum(s.actual_duration_hours or 0 for s in completed_steps)
        total_breach_hours = sum(s.sla_breach_hours or 0 for s in completed_steps)
        
        return {
            'total_steps': total_steps,
            'on_time_steps': on_time_steps,
            'breached_steps': breached_steps,
            'compliance_percentage': (on_time_steps / total_steps) * 100 if total_steps > 0 else 0,
            'average_duration_hours': total_duration_hours / total_steps if total_steps > 0 else 0,
            'average_duration_days': (total_duration_hours / total_steps) / 24 if total_steps > 0 else 0,
            'total_breach_hours': total_breach_hours
        }
