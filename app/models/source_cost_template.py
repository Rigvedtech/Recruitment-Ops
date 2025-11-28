from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
from app.models.profile import SourceEnum
import uuid

class SourceCostTemplate(db.Model):
    __tablename__ = 'source_cost_templates'

    template_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    source = db.Column(db.Enum(SourceEnum), unique=True, nullable=False)
    cost = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<SourceCostTemplate {self.source.value}: {self.cost}>'

    def to_dict(self):
        return {
            'template_id': str(self.template_id) if self.template_id else None,
            'source': self.source.value if self.source else None,
            'cost': float(self.cost) if self.cost else 0.0,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

