# DEPRECATED: This model is part of the legacy SQLite system
# The new PostgreSQL schema uses separate tables for each workflow step
# This file is kept for backward compatibility but should not be used in new code
# TODO: Remove this file after migration is complete

from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import json
import uuid

class WorkflowProgress(db.Model):
    __tablename__ = 'workflow_progress'
    
    id = db.Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=False, unique=True)
    request_id = db.Column(db.String(20), nullable=True)  # Keep for reference
    
    # Workflow step states (stored as JSON arrays of student IDs)
    screening_selected = db.Column(db.Text, default='[]')  # JSON array of student IDs
    screening_rejected = db.Column(db.Text, default='[]')  # JSON array of student IDs
    interview_scheduled = db.Column(db.Text, default='[]')  # JSON array of student IDs
    interview_rescheduled = db.Column(db.Text, default='[]')  # JSON array of student IDs
    round1_selected = db.Column(db.Text, default='[]')  # JSON array of student IDs
    round1_rejected = db.Column(db.Text, default='[]')  # JSON array of student IDs
    round1_rescheduled = db.Column(db.Text, default='[]')  # JSON array of student IDs
    round2_selected = db.Column(db.Text, default='[]')  # JSON array of student IDs
    round2_rejected = db.Column(db.Text, default='[]')  # JSON array of student IDs
    round2_rescheduled = db.Column(db.Text, default='[]')  # JSON array of student IDs
    offered = db.Column(db.Text, default='[]')  # JSON array of student IDs
    onboarding = db.Column(db.Text, default='[]')  # JSON array of student IDs
    
    # Current workflow step
    current_step = db.Column(db.String(50), default='candidate_submission')
    
    # Additional tracking data
    newly_added_profiles = db.Column(db.Text, default='[]')  # JSON array of student IDs
    session_start_time = db.Column(db.BigInteger, default=0)  # Unix timestamp
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    requirement = db.relationship('Requirement', backref='workflow_progress', lazy=True)
    
    def __repr__(self):
        return f'<WorkflowProgress {self.request_id}>'
    
    def to_dict(self):
        """Convert model to dictionary with parsed JSON arrays"""
        return {
            'id': self.id,
            'request_id': self.request_id,
            'screening_selected': self.get_screening_selected(),
            'screening_rejected': self.get_screening_rejected(),
            'interview_scheduled': self.get_interview_scheduled(),
            'interview_rescheduled': self.get_interview_rescheduled(),
            'round1_selected': self.get_round1_selected(),
            'round1_rejected': self.get_round1_rejected(),
            'round1_rescheduled': self.get_round1_rescheduled(),
            'round2_selected': self.get_round2_selected(),
            'round2_rejected': self.get_round2_rejected(),
            'round2_rescheduled': self.get_round2_rescheduled(),
            'offered': self.get_offered(),
            'onboarding': self.get_onboarding(),
            'current_step': self.current_step,
            'newly_added_profiles': self.get_newly_added_profiles(),
            'session_start_time': self.session_start_time,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    # Helper methods to safely parse JSON arrays
    def get_screening_selected(self):
        try:
            return json.loads(self.screening_selected) if self.screening_selected else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_screening_rejected(self):
        try:
            return json.loads(self.screening_rejected) if self.screening_rejected else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_interview_scheduled(self):
        try:
            return json.loads(self.interview_scheduled) if self.interview_scheduled else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_interview_rescheduled(self):
        try:
            return json.loads(self.interview_rescheduled) if self.interview_rescheduled else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_round1_selected(self):
        try:
            return json.loads(self.round1_selected) if self.round1_selected else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_round1_rejected(self):
        try:
            return json.loads(self.round1_rejected) if self.round1_rejected else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_round1_rescheduled(self):
        try:
            return json.loads(self.round1_rescheduled) if self.round1_rescheduled else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_round2_selected(self):
        try:
            return json.loads(self.round2_selected) if self.round2_selected else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_round2_rejected(self):
        try:
            return json.loads(self.round2_rejected) if self.round2_rejected else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_round2_rescheduled(self):
        try:
            return json.loads(self.round2_rescheduled) if self.round2_rescheduled else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_offered(self):
        try:
            return json.loads(self.offered) if self.offered else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_onboarding(self):
        try:
            return json.loads(self.onboarding) if self.onboarding else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    def get_newly_added_profiles(self):
        try:
            return json.loads(self.newly_added_profiles) if self.newly_added_profiles else []
        except (json.JSONDecodeError, TypeError):
            return []
    
    # Setter methods to safely store JSON arrays
    def set_screening_selected(self, student_ids):
        self.screening_selected = json.dumps(student_ids) if student_ids else '[]'
    
    def set_screening_rejected(self, student_ids):
        self.screening_rejected = json.dumps(student_ids) if student_ids else '[]'
    
    def set_interview_scheduled(self, student_ids):
        self.interview_scheduled = json.dumps(student_ids) if student_ids else '[]'
    
    def set_interview_rescheduled(self, student_ids):
        self.interview_rescheduled = json.dumps(student_ids) if student_ids else '[]'
    
    def set_round1_selected(self, student_ids):
        self.round1_selected = json.dumps(student_ids) if student_ids else '[]'
    
    def set_round1_rejected(self, student_ids):
        self.round1_rejected = json.dumps(student_ids) if student_ids else '[]'
    
    def set_round1_rescheduled(self, student_ids):
        self.round1_rescheduled = json.dumps(student_ids) if student_ids else '[]'
    
    def set_round2_selected(self, student_ids):
        self.round2_selected = json.dumps(student_ids) if student_ids else '[]'
    
    def set_round2_rejected(self, student_ids):
        self.round2_rejected = json.dumps(student_ids) if student_ids else '[]'
    
    def set_round2_rescheduled(self, student_ids):
        self.round2_rescheduled = json.dumps(student_ids) if student_ids else '[]'
    
    def set_offered(self, student_ids):
        self.offered = json.dumps(student_ids) if student_ids else '[]'
    
    def set_onboarding(self, student_ids):
        self.onboarding = json.dumps(student_ids) if student_ids else '[]'
    
    def set_newly_added_profiles(self, student_ids):
        self.newly_added_profiles = json.dumps(student_ids) if student_ids else '[]'
    
    @classmethod
    def get_by_request_id(cls, request_id: str):
        """Get workflow progress by request ID"""
        return cls.query.filter_by(request_id=request_id).first()
    
    @classmethod
    def create_or_update(cls, request_id: str, data: dict):
        """Create or update workflow progress for a request"""
        workflow = cls.get_by_request_id(request_id)
        
        if not workflow:
            workflow = cls(request_id=request_id)
        
        # Update all fields from the data
        if 'screening_selected' in data:
            workflow.set_screening_selected(data['screening_selected'])
        if 'screening_rejected' in data:
            workflow.set_screening_rejected(data['screening_rejected'])
        if 'interview_scheduled' in data:
            workflow.set_interview_scheduled(data['interview_scheduled'])
        if 'interview_rescheduled' in data:
            workflow.set_interview_rescheduled(data['interview_rescheduled'])
        if 'round1_selected' in data:
            workflow.set_round1_selected(data['round1_selected'])
        if 'round1_rejected' in data:
            workflow.set_round1_rejected(data['round1_rejected'])
        if 'round1_rescheduled' in data:
            workflow.set_round1_rescheduled(data['round1_rescheduled'])
        if 'round2_selected' in data:
            workflow.set_round2_selected(data['round2_selected'])
        if 'round2_rejected' in data:
            workflow.set_round2_rejected(data['round2_rejected'])
        if 'round2_rescheduled' in data:
            workflow.set_round2_rescheduled(data['round2_rescheduled'])
        if 'offered' in data:
            workflow.set_offered(data['offered'])
        if 'onboarding' in data:
            workflow.set_onboarding(data['onboarding'])
        if 'current_step' in data:
            workflow.current_step = data['current_step']
        if 'newly_added_profiles' in data:
            workflow.set_newly_added_profiles(data['newly_added_profiles'])
        if 'session_start_time' in data:
            workflow.session_start_time = data['session_start_time']
        
        workflow.updated_at = datetime.utcnow()
        
        try:
            db.session.add(workflow)
            db.session.commit()
            return workflow
        except Exception as e:
            db.session.rollback()
            raise e

    def get_profiles_beyond_step(self, step: str) -> set:
        """
        Get all student IDs that have progressed beyond a specific step.
        This is used to determine which profiles should have their previous step actions blocked.
        
        Args:
            step: The step to check beyond (e.g., 'screening', 'interview_scheduled', etc.)
        
        Returns:
            Set of student IDs that have progressed beyond the specified step
        """
        profiles_beyond = set()
        
        # Define the progression order of steps
        step_order = [
            'screening',
            'interview_scheduled', 
            'interview_round_1',
            'interview_round_2',
            'offered',
            'onboarding'
        ]
        
        try:
            step_index = step_order.index(step)
        except ValueError:
            # If step not found in order, return empty set
            return profiles_beyond
        
        # Get all profiles that have progressed to steps beyond the specified step
        for i in range(step_index + 1, len(step_order)):
            next_step = step_order[i]
            
            if next_step == 'interview_scheduled':
                profiles_beyond.update(self.get_interview_scheduled())
                profiles_beyond.update(self.get_interview_rescheduled())
            elif next_step == 'interview_round_1':
                profiles_beyond.update(self.get_round1_selected())
                profiles_beyond.update(self.get_round1_rejected())
                profiles_beyond.update(self.get_round1_rescheduled())
            elif next_step == 'interview_round_2':
                profiles_beyond.update(self.get_round2_selected())
                profiles_beyond.update(self.get_round2_rejected())
                profiles_beyond.update(self.get_round2_rescheduled())
            elif next_step == 'offered':
                profiles_beyond.update(self.get_offered())
            elif next_step == 'onboarding':
                profiles_beyond.update(self.get_onboarding())
        
        return profiles_beyond

    def get_profiles_in_step_and_beyond(self, step: str) -> set:
        """
        Get all student IDs that are in a specific step or have progressed beyond it.
        This is used to determine which profiles should have their actions blocked in previous steps.
        
        Args:
            step: The step to check (e.g., 'screening', 'interview_scheduled', etc.)
        
        Returns:
            Set of student IDs that are in this step or have progressed beyond it
        """
        profiles_in_and_beyond = set()
        
        # Define the progression order of steps
        step_order = [
            'screening',
            'interview_scheduled', 
            'interview_round_1',
            'interview_round_2',
            'offered',
            'onboarding'
        ]
        
        try:
            step_index = step_order.index(step)
        except ValueError:
            # If step not found in order, return empty set
            return profiles_in_and_beyond
        
        # Get all profiles that are in this step or have progressed beyond it
        for i in range(step_index, len(step_order)):
            current_step = step_order[i]
            
            if current_step == 'screening':
                profiles_in_and_beyond.update(self.get_screening_selected())
                profiles_in_and_beyond.update(self.get_screening_rejected())
            elif current_step == 'interview_scheduled':
                profiles_in_and_beyond.update(self.get_interview_scheduled())
                profiles_in_and_beyond.update(self.get_interview_rescheduled())
            elif current_step == 'interview_round_1':
                profiles_in_and_beyond.update(self.get_round1_selected())
                profiles_in_and_beyond.update(self.get_round1_rejected())
                profiles_in_and_beyond.update(self.get_round1_rescheduled())
            elif current_step == 'interview_round_2':
                profiles_in_and_beyond.update(self.get_round2_selected())
                profiles_in_and_beyond.update(self.get_round2_rejected())
                profiles_in_and_beyond.update(self.get_round2_rescheduled())
            elif current_step == 'offered':
                profiles_in_and_beyond.update(self.get_offered())
            elif current_step == 'onboarding':
                profiles_in_and_beyond.update(self.get_onboarding())
        
        return profiles_in_and_beyond

    def get_blocked_profiles_for_step(self, step: str) -> set:
        """
        Get student IDs that should have their actions blocked for a specific step.
        This is used to determine which action buttons should be disabled.
        
        Args:
            step: The current step where we want to check for blocked profiles
        
        Returns:
            Set of student IDs that should have their actions blocked in this step
        """
        # For each step, we want to block profiles that have progressed beyond this step
        # This means when you're in a step, profiles that have moved to later steps should be blocked
        
        # Define the progression order of steps
        step_order = [
            'screening',
            'interview_scheduled', 
            'interview_round_1',
            'interview_round_2',
            'offered',
            'onboarding'
        ]
        
        try:
            step_index = step_order.index(step)
        except ValueError:
            # If step not found in order, return empty set
            return set()
        
        # For screening step, block profiles that have moved to interview_scheduled or beyond
        if step == 'screening':
            return self.get_profiles_beyond_step('screening')
        
        # For other steps, get profiles that are in steps beyond the current step
        return self.get_profiles_beyond_step(step)
