from datetime import datetime
from app.database import db, GUID, postgresql_uuid_default
import uuid
import enum

class SettingKeyEnum(enum.Enum):
    last_email_refresh = "last_email_refresh"

class SystemSettings(db.Model):
    __tablename__ = 'system_settings'
    
    system_setting_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    setting_key = db.Column(db.Enum(SettingKeyEnum), unique=True, nullable=False)
    setting_value = db.Column(db.Text, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # No specific relationships defined as this is a standalone system configuration record
    
    def __repr__(self):
        return f'<SystemSettings {self.setting_key}: {self.setting_value}>'
    
    def to_dict(self):
        return {
            'system_setting_id': str(self.system_setting_id) if self.system_setting_id else None,
            'setting_key': self.setting_key.value if self.setting_key else None,
            'setting_value': self.setting_value,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    @classmethod
    def get_setting(cls, key: SettingKeyEnum) -> str:
        """Get a setting value by key"""
        setting = cls.query.filter_by(setting_key=key).first()
        return setting.setting_value if setting else None
    
    @classmethod
    def set_setting(cls, key: SettingKeyEnum, value: str):
        """Set a setting value by key (upsert)"""
        setting = cls.query.filter_by(setting_key=key).first()
        if setting:
            setting.setting_value = value
            setting.updated_at = datetime.utcnow()
        else:
            setting = cls(setting_key=key, setting_value=value)
            db.session.add(setting)
        
        db.session.commit()
        return setting 