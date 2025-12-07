"""
SourceCostTemplate Model - Uses PostgreSQL ENUMs as the ONLY source of truth.
No hardcoded Python enum classes - all enum values come from the database.
"""
from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid


class SourceCostTemplate(db.Model):
    __tablename__ = 'source_cost_templates'

    template_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    source = db.Column(db.String(50), unique=True, nullable=False)  # Uses PostgreSQL enum values as strings
    cost = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<SourceCostTemplate {self.source}: {self.cost}>'

    def to_dict(self):
        return {
            'template_id': str(self.template_id) if self.template_id else None,
            'source': self.source,  # Already a string
            'cost': float(self.cost) if self.cost else 0.0,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
