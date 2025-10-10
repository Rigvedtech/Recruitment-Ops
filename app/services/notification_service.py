import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from app.models.notification import Notification
from app.models.user import User
from app.database import db
from flask import current_app, g
import pytz

def get_db_session():
    """
    Get the correct database session for the current domain.
    Returns domain-specific session if available, otherwise falls back to global session.
    """
    try:
        # Check if we have a domain-specific session
        if hasattr(g, 'db_session') and g.db_session is not None:
            # Verify it's a valid session object
            if hasattr(g.db_session, 'query'):
                return g.db_session
        
        # Fallback to global session for backward compatibility
        # Get the actual session from Flask-SQLAlchemy
        try:
            # This gets the actual SQLAlchemy session
            session = db.session
            if hasattr(session, 'query'):
                return session
            else:
                current_app.logger.error("db.session does not have query method")
                # Try to create a new session from the engine
                from sqlalchemy.orm import sessionmaker
                Session = sessionmaker(bind=db.engine)
                return Session()
        except Exception as session_error:
            current_app.logger.error(f"Error accessing db.session: {str(session_error)}")
            # Last resort: try to create session from engine
            try:
                from sqlalchemy.orm import sessionmaker
                Session = sessionmaker(bind=db.engine)
                return Session()
            except Exception as engine_error:
                current_app.logger.error(f"Error creating session from engine: {str(engine_error)}")
                raise Exception("Cannot create database session")
        
    except Exception as e:
        # If there's any error, log it and re-raise
        current_app.logger.error(f"Critical error in get_db_session: {str(e)}")
        raise e

# IST timezone
IST = pytz.timezone('Asia/Kolkata')

class NotificationService:
    """Service to handle creating and managing notifications"""
    
    @staticmethod
    def create_notification(
        user_id: Union[int, str],  # Can be integer (legacy) or UUID string
        notification_type: str,
        title: str,
        message: str,
        data: Optional[Dict[str, Any]] = None,
        expires_at: Optional[datetime] = None
    ) -> Optional[Notification]:
        """
        Create a new notification
        
        Args:
            user_id: ID of the user to notify
            notification_type: Type of notification (sla_breach, new_assignment, etc.)
            title: Notification title
            message: Notification message
            data: Additional data as dictionary
            expires_at: Optional expiration time
            
        Returns:
            Created Notification object or None if failed
        """
        try:
            # Validate user exists
            if isinstance(user_id, str) and len(user_id) == 36:
                # user_id is already a UUID
                user = get_db_session().query(User).filter_by(user_id=user_id).first()
            else:
                # Try legacy integer lookup
                try:
                    import uuid
                    # For backward compatibility, assume integer user_id corresponds to user index
                    users = get_db_session().query(User).all()
                    if isinstance(user_id, int) and 1 <= user_id <= len(users):
                        user = users[user_id - 1]
                    else:
                        user = None
                except:
                    user = None

            if not user:
                current_app.logger.error(f"User {user_id} not found for notification")
                return None
            
            # Convert data to JSON string if provided
            data_json = None
            if data:
                try:
                    data_json = json.dumps(data)
                except json.JSONEncodeError as e:
                    current_app.logger.error(f"Error encoding notification data to JSON: {str(e)}")
                    data_json = None
            
            notification = Notification(
                user_id=user.user_id,
                type=notification_type,
                title=title,
                message=message,
                data=data_json,
                expires_at=expires_at
            )
            
            get_db_session().add(notification)
            get_db_session().commit()
            
            current_app.logger.info(f"Created notification {notification.notification_id} for user {user_id}: {notification_type}")
            return notification
            
        except Exception as e:
            get_db_session().rollback()
            current_app.logger.error(f"Error creating notification: {str(e)}")
            return None
    
    @staticmethod
    def create_sla_breach_notification(
        assigned_recruiter: str,
        request_id: str,
        job_title: str,
        company_name: str,
        step_name: str,
        breach_time_display: str
    ) -> Optional[Notification]:
        """Create SLA breach notification for a recruiter"""
        try:
            # Find the recruiter user
            user = get_db_session().query(User).filter_by(username=assigned_recruiter).first()
            if not user:
                current_app.logger.warning(f"Recruiter {assigned_recruiter} not found for SLA breach notification")
                return None
            
            title = f"SLA Breach Alert - {request_id}"
            message = f"SLA breached for {step_name} step in {job_title} at {company_name}. Breach time: {breach_time_display}"
            
            data = {
                'request_id': request_id,
                'job_title': job_title,
                'company_name': company_name,
                'step_name': step_name,
                'breach_time_display': breach_time_display,
                'alert_type': 'sla_breach'
            }
            
            # Set expiration to 7 days from now
            expires_at = datetime.now(IST) + timedelta(days=7)
            
            # Create notification directly since we already have the user
            data_json = json.dumps(data) if data else None
            
            notification = Notification(
                user_id=user.user_id,
                type='sla_breach',
                title=title,
                message=message,
                data=data_json,
                expires_at=expires_at
            )
            
            get_db_session().add(notification)
            get_db_session().commit()
            
            current_app.logger.info(f"Created notification {notification.notification_id} for user {user.username}: sla_breach")
            return notification
            
        except Exception as e:
            get_db_session().rollback()
            current_app.logger.error(f"Error creating SLA breach notification: {str(e)}")
            return None
    
    @staticmethod
    def create_new_assignment_notification(
        recruiter_username: str,
        request_id: str,
        job_title: str,
        company_name: str
    ) -> Optional[Notification]:
        """Create new requirement assignment notification for a recruiter"""
        try:
            # Find the recruiter user
            user = get_db_session().query(User).filter_by(username=recruiter_username).first()
            if not user:
                current_app.logger.warning(f"Recruiter {recruiter_username} not found for assignment notification")
                return None
            
            title = f"New Assignment - {request_id}"
            message = f"You have been assigned a new requirement: {job_title} at {company_name}"
            
            data = {
                'request_id': request_id,
                'job_title': job_title,
                'company_name': company_name,
                'alert_type': 'new_assignment'
            }
            
            # Set expiration to 30 days from now
            expires_at = datetime.now(IST) + timedelta(days=30)
            
            # Create notification directly since we already have the user
            data_json = json.dumps(data) if data else None
            
            notification = Notification(
                user_id=user.user_id,
                type='new_assignment',
                title=title,
                message=message,
                data=data_json,
                expires_at=expires_at
            )
            
            get_db_session().add(notification)
            get_db_session().commit()
            
            current_app.logger.info(f"Created notification {notification.notification_id} for user {user.username}: new_assignment")
            return notification
            
        except Exception as e:
            get_db_session().rollback()
            current_app.logger.error(f"Error creating assignment notification: {str(e)}")
            return None
    
    @staticmethod
    def create_new_assignment_notification_with_email(
        recruiter_username: str,
        request_id: str,
        job_title: str,
        company_name: str,
        requirement_details: Optional[dict] = None
    ) -> Optional[Notification]:
        """Create new requirement assignment notification AND send email"""
        try:
            # First create the notification bell notification
            notification = NotificationService.create_new_assignment_notification(
                recruiter_username=recruiter_username,
                request_id=request_id,
                job_title=job_title,
                company_name=company_name
            )
            
            # Then send email notification
            try:
                from app.services.email_notification_service import EmailNotificationService
                
                email_sent = EmailNotificationService.send_new_assignment_email(
                    recruiter_username=recruiter_username,
                    request_id=request_id,
                    job_title=job_title,
                    company_name=company_name,
                    requirement_details=requirement_details
                )
                
                if email_sent:
                    current_app.logger.info(f"Both notification and email sent successfully for assignment {request_id} to {recruiter_username}")
                else:
                    current_app.logger.warning(f"Notification created but email failed for assignment {request_id} to {recruiter_username}")
                    
            except Exception as email_error:
                current_app.logger.error(f"Error sending assignment email to {recruiter_username}: {str(email_error)}")
                # Don't fail the whole process if email fails - notification bell still works
            
            return notification
            
        except Exception as e:
            current_app.logger.error(f"Error creating assignment notification with email: {str(e)}")
            return None
    
    @staticmethod
    def create_recruiter_activity_notification(
        admin_user_id: int,
        recruiter_username: str,
        activity_type: str,
        details: str
    ) -> Optional[Notification]:
        """Create recruiter activity notification for admin"""
        try:
            title = f"Recruiter Activity - {recruiter_username}"
            message = f"{recruiter_username} {activity_type}: {details}"
            
            data = {
                'recruiter_username': recruiter_username,
                'activity_type': activity_type,
                'details': details,
                'alert_type': 'recruiter_activity'
            }
            
            # Set expiration to 7 days from now
            expires_at = datetime.now(IST) + timedelta(days=7)
            
            return NotificationService.create_notification(
                user_id=admin_user_id,
                notification_type='recruiter_activity',
                title=title,
                message=message,
                data=data,
                expires_at=expires_at
            )
            
        except Exception as e:
            current_app.logger.error(f"Error creating recruiter activity notification: {str(e)}")
            return None
    
    @staticmethod
    def create_recruiter_inactivity_notification(
        admin_user_id: int,
        recruiter_username: str,
        inactive_days: int
    ) -> Optional[Notification]:
        """Create recruiter inactivity notification for admin"""
        try:
            title = f"Recruiter Inactivity Alert - {recruiter_username}"
            message = f"{recruiter_username} has been inactive for {inactive_days} days with no profile submissions"
            
            data = {
                'recruiter_username': recruiter_username,
                'inactive_days': inactive_days,
                'alert_type': 'recruiter_inactivity'
            }
            
            # Set expiration to 7 days from now
            expires_at = datetime.now(IST) + timedelta(days=7)
            
            return NotificationService.create_notification(
                user_id=admin_user_id,
                notification_type='recruiter_inactivity',
                title=title,
                message=message,
                data=data,
                expires_at=expires_at
            )
            
        except Exception as e:
            current_app.logger.error(f"Error creating recruiter inactivity notification: {str(e)}")
            return None
    
    @staticmethod
    def get_user_notifications(user_id: Union[int, str], include_read: bool = True, limit: int = 50) -> List[Dict[str, Any]]:
        """Get notifications for a user"""
        try:
            # Convert legacy integer user_id to UUID if needed
            if isinstance(user_id, int):
                users = get_db_session().query(User).all()
                if 1 <= user_id <= len(users):
                    actual_user_id = users[user_id - 1].user_id
                else:
                    return []
            else:
                actual_user_id = user_id

            notifications = Notification.get_user_notifications(actual_user_id, include_read, limit)
            return [notification.to_dict() for notification in notifications]
        except Exception as e:
            current_app.logger.error(f"Error getting user notifications: {str(e)}")
            return []
    
    @staticmethod
    def get_unread_count(user_id: Union[int, str]) -> int:
        """Get count of unread notifications for a user"""
        try:
            # Convert legacy integer user_id to UUID if needed
            if isinstance(user_id, int):
                users = get_db_session().query(User).all()
                if 1 <= user_id <= len(users):
                    actual_user_id = users[user_id - 1].user_id
                else:
                    return 0
            else:
                actual_user_id = user_id

            return Notification.get_unread_count(actual_user_id)
        except Exception as e:
            current_app.logger.error(f"Error getting unread count: {str(e)}")
            return 0
    
    @staticmethod
    def mark_notification_as_read(notification_id: int, user_id: Union[int, str]) -> bool:
        """Mark a specific notification as read"""
        try:
            # Get the user (handle both legacy integer and UUID user_id)
            from app.models.user import User
            if isinstance(user_id, str) and len(user_id) == 36:
                user = get_db_session().query(User).filter_by(user_id=user_id).first()
            else:
                # Legacy integer lookup
                users = get_db_session().query(User).all()
                if isinstance(user_id, int) and 1 <= user_id <= len(users):
                    user = users[user_id - 1]
                else:
                    user = None
            
            if user and user.role == 'admin':
                # Admin can mark any notification as read
                notification = get_db_session().query(Notification).filter_by(notification_id=notification_id).first()
            else:
                # Regular users can only mark their own notifications as read
                notification = get_db_session().query(Notification).filter_by(
                    notification_id=notification_id,
                    user_id=user_id
                ).first()
            
            if not notification:
                if user and user.role == 'admin':
                    current_app.logger.warning(f"Notification {notification_id} not found")
                else:
                    current_app.logger.warning(f"Notification {notification_id} not found for user {user_id}")
                return False
            
            notification.mark_as_read()
            return True
            
        except Exception as e:
            current_app.logger.error(f"Error marking notification as read: {str(e)}")
            return False
    
    @staticmethod
    def mark_all_as_read(user_id: Union[int, str]) -> bool:
        """Mark all notifications as read for a user"""
        try:
            # Get the user (handle both legacy integer and UUID user_id)
            from app.models.user import User
            if isinstance(user_id, str) and len(user_id) == 36:
                user = get_db_session().query(User).filter_by(user_id=user_id).first()
            else:
                # Legacy integer lookup
                users = get_db_session().query(User).all()
                if isinstance(user_id, int) and 1 <= user_id <= len(users):
                    user = users[user_id - 1]
                else:
                    user = None
            
            if user and user.role == 'admin':
                # Admin marks ALL unread notifications as read (from all users)
                all_unread_notifications = get_db_session().query(Notification).filter_by(is_read=False).all()
                count = 0
                for notification in all_unread_notifications:
                    notification.is_read = True
                    notification.updated_at = datetime.now(IST)
                    count += 1
                db.session.commit()
                current_app.logger.info(f"Admin marked {count} notifications as read from all users")
            else:
                # Regular user marks only their own notifications as read
                count = Notification.mark_all_as_read(user_id)
                current_app.logger.info(f"Marked {count} notifications as read for user {user_id}")
            
            return True
        except Exception as e:
            current_app.logger.error(f"Error marking all notifications as read: {str(e)}")
            return False
    
    @staticmethod
    def notify_all_admins(
        notification_type: str,
        title: str,
        message: str,
        data: Optional[Dict[str, Any]] = None,
        expires_at: Optional[datetime] = None
    ) -> List[Notification]:
        """Create notifications for all admin users"""
        notifications = []
        try:
            admin_users = get_db_session().query(User).filter_by(role='admin').all()
            
            for admin in admin_users:
                notification = NotificationService.create_notification(
                    user_id=admin.user_id,
                    notification_type=notification_type,
                    title=title,
                    message=message,
                    data=data,
                    expires_at=expires_at
                )
                if notification:
                    notifications.append(notification)
            
            current_app.logger.info(f"Created {len(notifications)} admin notifications of type {notification_type}")
            return notifications
            
        except Exception as e:
            current_app.logger.error(f"Error creating admin notifications: {str(e)}")
            return notifications
    
    @staticmethod
    def cleanup_expired_notifications() -> int:
        """Clean up expired notifications"""
        try:
            count = Notification.cleanup_expired()
            current_app.logger.info(f"Cleaned up {count} expired notifications")
            return count
        except Exception as e:
            current_app.logger.error(f"Error cleaning up notifications: {str(e)}")
            return 0
    
    @staticmethod
    def process_sla_breach_alerts(alerts: List[Dict[str, Any]]) -> int:
        """Process SLA breach alerts and create notifications"""
        notifications_created = 0
        
        try:
            for alert in alerts:
                if alert.get('assigned_recruiter'):
                    notification = NotificationService.create_sla_breach_notification(
                        assigned_recruiter=alert['assigned_recruiter'],
                        request_id=alert['request_id'],
                        job_title=alert.get('job_title', 'Unknown'),
                        company_name=alert.get('company_name', 'Unknown'),
                        step_name=alert.get('step_display_name', alert.get('step_name', 'Unknown')),
                        breach_time_display=alert.get('breach_time_display', 'Unknown')
                    )
                    
                    if notification:
                        notifications_created += 1
                        
                        # Also notify all admins about the SLA breach
                        admin_notifications = NotificationService.notify_all_admins(
                            notification_type='sla_breach_admin',
                            title=f"SLA Breach Alert - {alert['request_id']}",
                            message=f"SLA breached by {alert['assigned_recruiter']} for {alert.get('job_title', 'Unknown')} at {alert.get('company_name', 'Unknown')}",
                            data=alert,
                            expires_at=datetime.now(IST) + timedelta(days=7)
                        )
                        notifications_created += len(admin_notifications)
            
            current_app.logger.info(f"Created {notifications_created} notifications from {len(alerts)} SLA breach alerts")
            return notifications_created
            
        except Exception as e:
            current_app.logger.error(f"Error processing SLA breach alerts: {str(e)}")
            return notifications_created
