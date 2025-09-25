from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid

class Offer(db.Model):
    __tablename__ = 'offer'
    
    offer_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    profile_id = db.Column(GUID, db.ForeignKey('profiles.profile_id'), nullable=False)
    requirement_id = db.Column(GUID, db.ForeignKey('requirements.requirement_id'), nullable=False)
    ctc_offered = db.Column(db.Numeric(10, 2), nullable=True)
    final_ctc_offered = db.Column(db.Numeric(10, 2), nullable=True)
    active = db.Column(db.Boolean, default=True, nullable=False)
    remark = db.Column(db.Text, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships are already defined in Requirement and Profile models
    
    def __repr__(self):
        return f'<Offer {self.offer_id}>'
    
    def to_dict(self):
        return {
            'offer_id': str(self.offer_id) if self.offer_id else None,
            'profile_id': str(self.profile_id) if self.profile_id else None,
            'requirement_id': str(self.requirement_id) if self.requirement_id else None,
            'ctc_offered': float(self.ctc_offered) if self.ctc_offered else None,
            'final_ctc_offered': float(self.final_ctc_offered) if self.final_ctc_offered else None,
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
