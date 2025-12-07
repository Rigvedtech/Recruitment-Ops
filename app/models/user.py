"""
User Model - Uses PostgreSQL ENUMs as the ONLY source of truth.
No hardcoded Python enum classes - all enum values come from the database.
"""
from app.database import db, GUID, postgresql_uuid_default
from datetime import datetime
import bcrypt
import uuid


class User(db.Model):
    __tablename__ = 'users'
    
    user_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    username = db.Column(db.String(80), unique=True, nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    password = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    phone_number = db.Column(db.Numeric(10, 0), unique=True, nullable=True)
    role = db.Column(db.String(20), nullable=False, default='recruiter')  # Uses PostgreSQL enum values as strings
    otp = db.Column(db.Numeric(6, 0), nullable=True)
    otp_expiry_time = db.Column(db.DateTime, nullable=True)
    failed_attempts = db.Column(db.Integer, default=0, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    created_requirements = db.relationship('Requirement', backref='creator', lazy=True, foreign_keys='Requirement.created_by')
    updated_requirements = db.relationship('Requirement', backref='updater', lazy=True, foreign_keys='Requirement.updated_by')
    created_profiles = db.relationship('Profile', backref='creator', lazy=True, foreign_keys='Profile.created_by')
    updated_profiles = db.relationship('Profile', backref='updater', lazy=True, foreign_keys='Profile.updated_by')
    created_skills = db.relationship('Skills', backref='creator', lazy=True, foreign_keys='Skills.created_by')
    updated_skills = db.relationship('Skills', backref='updater', lazy=True, foreign_keys='Skills.updated_by')
    notifications = db.relationship('Notification', backref='user', lazy=True, foreign_keys='Notification.user_id')
    
    def set_password(self, password):
        """Hash a password and store it"""
        salt = bcrypt.gensalt()
        self.password = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def check_password(self, password):
        """Check if the provided password matches the stored hash"""
        return bcrypt.checkpw(password.encode('utf-8'), self.password.encode('utf-8'))
    
    def to_dict(self):
        """Convert the model to a dictionary"""
        return {
            'user_id': str(self.user_id) if self.user_id else None,
            'username': self.username,
            'full_name': self.full_name,
            'email': self.email,
            'phone_number': str(self.phone_number) if self.phone_number else None,
            'role': self.role,  # Already a string
            'otp': str(self.otp) if self.otp else None,
            'otp_expiry_time': self.otp_expiry_time.isoformat() if self.otp_expiry_time else None,
            'failed_attempts': self.failed_attempts,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __repr__(self):
        return f'<User {self.username} ({self.role})>'
