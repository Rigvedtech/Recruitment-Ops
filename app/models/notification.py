from datetime import datetime, timezone, timedelta
from app.database import db, GUID, postgresql_uuid_default
import uuid
import pytz
import enum
from flask import g, current_app
from sqlalchemy.orm import sessionmaker

def get_db_session():
    try:
        if hasattr(g, 'db_session') and g.db_session is not None:
            if hasattr(g.db_session, 'query'):
                return g.db_session
        
        session = db.session
        if hasattr(session, 'query'):
            return session
        else:
            current_app.logger.error("db.session does not have query method")
            from sqlalchemy.orm import sessionmaker
            Session = sessionmaker(bind=db.engine)
            return Session()
    except Exception as session_error:
        current_app.logger.error(f"Error accessing db.session: {str(session_error)}")
        try:
            from sqlalchemy.orm import sessionmaker
            Session = sessionmaker(bind=db.engine)
            return Session()
        except Exception as engine_error:
            current_app.logger.error(f"Error creating session from engine: {str(engine_error)}")
            raise Exception("Cannot create database session")
    except Exception as e:
        current_app.logger.error(f"Critical error in get_db_session: {str(e)}")
        raise e



# IST timezone
IST = pytz.timezone('Asia/Kolkata')

class NotificationTypeEnum(enum.Enum):
    info = "info"
    warning = "warning"
    error = "error"
    success = "success"
    new_assignment = "new_assignment"

class Notification(db.Model):
    __tablename__ = 'notifications'
    
    notification_id = db.Column(GUID, primary_key=True, server_default=postgresql_uuid_default())
    user_id = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=False)
    type = db.Column(db.Enum(NotificationTypeEnum), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    data = db.Column(db.Text, nullable=True)
    is_read = db.Column(db.Boolean, default=False, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    updated_by = db.Column(GUID, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(IST), nullable=False)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(IST), onupdate=lambda: datetime.now(IST))
    
    # Relationships are defined in the User model to avoid conflicts
    
    def __repr__(self):
        return f'<Notification {self.notification_id}: {self.type.value if self.type else None} for User {self.user_id}>'
    
    def to_dict(self):
        """Convert notification to dictionary with IST timezone information"""
        import json
        
        # Parse data field if it exists
        parsed_data = None
        if self.data:
            try:
                parsed_data = json.loads(self.data)
            except json.JSONDecodeError:
                parsed_data = None
        
        # Helper function to format datetime with timezone info
        def format_datetime_with_timezone(dt):
            if not dt:
                return None
            # If the datetime is naive (no timezone), assume it's IST
            if dt.tzinfo is None:
                dt = IST.localize(dt)
            # Convert to IST if it's in a different timezone
            elif dt.tzinfo != IST:
                dt = dt.astimezone(IST)
            # Return with timezone information
            return dt.isoformat()
        
        return {
            'notification_id': str(self.notification_id) if self.notification_id else None,
            'user_id': str(self.user_id) if self.user_id else None,
            'type': self.type.value if self.type else None,
            'title': self.title,
            'message': self.message,
            'data': parsed_data,
            'is_read': self.is_read,
            'expires_at': format_datetime_with_timezone(self.expires_at),
            'is_deleted': self.is_deleted,
            'deleted_at': format_datetime_with_timezone(self.deleted_at),
            'deleted_by': str(self.deleted_by) if self.deleted_by else None,
            'created_by': str(self.created_by) if self.created_by else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
            'created_at': format_datetime_with_timezone(self.created_at),
            'updated_at': format_datetime_with_timezone(self.updated_at)
        }
    
    def mark_as_read(self):
        """Mark notification as read"""
        self.is_read = True
        self.updated_at = datetime.now(IST)
        db.session.commit()
    
    def is_expired(self):
        """Check if notification has expired"""
        if not self.expires_at:
            return False
        return datetime.now(IST) > self.expires_at
    
    @staticmethod
    def get_user_notifications(user_id, include_read=True, limit=50):
        """Get notifications for a specific user"""
        query = get_db_session().query(Notification).filter_by(user_id=user_id)
        
        if not include_read:
            query = query.filter_by(is_read=False)
        
        # Exclude expired notifications
        query = query.filter(
            db.or_(
                Notification.expires_at.is_(None),
                Notification.expires_at > datetime.now(IST)
            )
        )
        
        return query.order_by(Notification.created_at.desc()).limit(limit).all()
    
    @staticmethod
    def get_unread_count(user_id):
        """Get count of unread notifications for a user"""
        return get_db_session().query(Notification).filter_by(
            user_id=user_id, 
            is_read=False
        ).filter(
            db.or_(
                Notification.expires_at.is_(None),
                Notification.expires_at > datetime.now(IST)
            )
        ).count()
    
    @staticmethod
    def mark_all_as_read(user_id):
        """Mark all notifications as read for a user"""
        notifications = get_db_session().query(Notification).filter_by(
            user_id=user_id,
            is_read=False
        ).all()
        
        for notification in notifications:
            notification.is_read = True
            notification.updated_at = datetime.now(IST)
        
        db.session.commit()
        return len(notifications)
    
    @staticmethod
    def cleanup_expired():
        """Clean up expired notifications"""
        expired = get_db_session().query(Notification).filter(
            Notification.expires_at < datetime.now(IST)
        ).all()
        
        for notification in expired:
            db.session.delete(notification)
        
        db.session.commit()
        return len(expired)
