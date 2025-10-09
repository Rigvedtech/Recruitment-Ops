from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default

class Assignment(db.Model):
    """Model for managing multiple recruiter assignments to requirements"""
    __tablename__ = 'assignments'
    
    assignment_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=False)
    user_id = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=False)
    assigned_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    last_activity_at = db.Column(db.DateTime, nullable=True)
    
    # Relationships
    requirement = db.relationship('Requirement', backref='assignments', lazy=True)
    user = db.relationship('User', foreign_keys=[user_id], backref='assignments', lazy=True)
    assigned_by_user = db.relationship('User', foreign_keys=[assigned_by], backref='made_assignments', lazy=True)
    
    def __repr__(self):
        return f'<Assignment {self.assignment_id}>'
    
    def to_dict(self):
        """Convert assignment to dictionary"""
        return {
            'assignment_id': str(self.assignment_id),
            'requirement_id': str(self.requirement_id),
            'user_id': str(self.user_id),
            'assigned_by': str(self.assigned_by) if self.assigned_by else None,
            'is_active': self.is_active,
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None,
            'last_activity_at': self.last_activity_at.isoformat() if self.last_activity_at else None,
            # Include user details for easier frontend consumption
            'username': self.user.username if self.user else None,
            'user_name': f"{self.user.first_name} {self.user.last_name}".strip() if self.user and self.user.first_name else None
        }
    
    def deactivate(self, deactivated_by=None):
        """Deactivate this assignment"""
        self.is_active = False
        self.last_activity_at = datetime.utcnow()
        if deactivated_by:
            # You could add a deactivated_by field if needed
            pass
    
    def update_activity(self):
        """Update the last activity timestamp"""
        self.last_activity_at = datetime.utcnow()
    
    @classmethod
    def get_active_assignments_for_requirement(cls, requirement_id, session=None):
        """Get all active assignments for a requirement"""
        if session is None:
            session = db.session
        return session.query(cls).filter_by(
            requirement_id=requirement_id,
            is_active=True
        ).all()
    
    @classmethod
    def get_active_assignments_for_user(cls, user_id, session=None):
        """Get all active assignments for a user"""
        if session is None:
            session = db.session
        return session.query(cls).filter_by(
            user_id=user_id,
            is_active=True
        ).all()
    
    @classmethod
    def assign_recruiters_to_requirement(cls, requirement_id, recruiter_user_ids, assigned_by=None, session=None):
        """Assign multiple recruiters to a requirement"""
        if session is None:
            session = db.session
            
        assignments = []
        
        for user_id in recruiter_user_ids:
            # Check if assignment already exists
            existing = session.query(cls).filter_by(
                requirement_id=requirement_id,
                user_id=user_id
            ).first()
            
            if existing:
                # Reactivate if it was deactivated
                if not existing.is_active:
                    existing.is_active = True
                    existing.assigned_at = datetime.utcnow()
                    existing.assigned_by = assigned_by
                else:
                    # Update activity and assigned_by
                    existing.update_activity()
                    if assigned_by:
                        existing.assigned_by = assigned_by
            else:
                # Create new assignment
                assignment = cls(
                    requirement_id=requirement_id,
                    user_id=user_id,
                    assigned_by=assigned_by,
                    is_active=True
                )
                session.add(assignment)
                assignments.append(assignment)
        
        return assignments
    
    @classmethod
    def deactivate_user_assignment(cls, requirement_id, user_id, session=None):
        """Deactivate a specific user's assignment to a requirement"""
        if session is None:
            session = db.session
            
        assignment = session.query(cls).filter_by(
            requirement_id=requirement_id,
            user_id=user_id,
            is_active=True
        ).first()
        
        if assignment:
            assignment.deactivate()
            return assignment
        return None
