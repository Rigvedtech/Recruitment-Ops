
from flask import Blueprint, request, jsonify, current_app, g
from app.services.notification_service import NotificationService
from app.models.user import User
from app.models.notification import Notification
from app.database import db
from app.middleware.domain_auth import require_domain_auth
from app.middleware.redis_performance_middleware import cache_response

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

notification_bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')

def get_user_by_legacy_id(user_id):
    """Helper function to get user by legacy integer ID (for UUID migration compatibility)"""
    try:
        # For backward compatibility, get the nth user without fetching all users
        if user_id >= 1:
            return get_db_session().query(User).offset(user_id - 1).limit(1).first()
    except:
        pass
    return None

@notification_bp.route('', methods=['GET'])
@require_domain_auth
def get_user_notifications():
    """Get notifications for the current user"""
    try:
        # Get user_id from request parameters (in a real app, you'd get this from authentication)
        user_id = request.args.get('user_id')
        if not user_id or user_id == 'undefined' or user_id == 'null':
            return jsonify({'error': 'user_id is required'}), 400

        # Validate user exists - only fetch user_id
        actual_user_id = get_db_session().query(User.user_id).filter_by(user_id=user_id).scalar()
        if not actual_user_id:
            return jsonify({'error': 'User not found'}), 404
        
        # Get query parameters
        include_read = request.args.get('include_read', 'true').lower() == 'true'
        limit = request.args.get('limit', 50, type=int)
        
        # Get notifications
        notifications = NotificationService.get_user_notifications(
            user_id=actual_user_id,  # Use actual user ID, not the parameter
            include_read=include_read,
            limit=limit
        )

        # Get unread count
        unread_count = NotificationService.get_unread_count(actual_user_id)
        
        return jsonify({
            'success': True,
            'notifications': notifications,
            'unread_count': unread_count,
            'total': len(notifications)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error getting user notifications: {str(e)}")
        return jsonify({'error': 'Failed to get notifications'}), 500

@notification_bp.route('/unread-count', methods=['GET'])
@require_domain_auth
def get_unread_count():
    """Get count of unread notifications for the current user"""
    try:
        # Get user_id from request parameters
        user_id = request.args.get('user_id')
        if not user_id or user_id == 'undefined' or user_id == 'null':
            return jsonify({'error': 'user_id is required'}), 400

        # Validate user exists - only fetch user_id
        actual_user_id = get_db_session().query(User.user_id).filter_by(user_id=user_id).scalar()
        if not actual_user_id:
            return jsonify({'error': 'User not found'}), 404

        unread_count = NotificationService.get_unread_count(actual_user_id)
        
        return jsonify({
            'success': True,
            'unread_count': unread_count
        })
        
    except Exception as e:
        current_app.logger.error(f"Error getting unread count: {str(e)}")
        return jsonify({'error': 'Failed to get unread count'}), 500

@notification_bp.route('/<notification_id>/read', methods=['POST'])
@require_domain_auth
def mark_notification_read(notification_id):
    """Mark a specific notification as read"""
    try:
        # Get user_id from request body
        data = request.get_json()
        user_id = data.get('user_id') if data else None

        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        # Let the service handle user validation and notification marking
        success = NotificationService.mark_notification_as_read(notification_id, user_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Notification marked as read'
            })
        else:
            return jsonify({'error': 'Notification not found or access denied'}), 404
            
    except Exception as e:
        current_app.logger.error(f"Error marking notification as read: {str(e)}")
        return jsonify({'error': 'Failed to mark notification as read'}), 500

@notification_bp.route('/mark-all-read', methods=['POST'])
@require_domain_auth
def mark_all_notifications_read():
    """Mark all notifications as read for the current user"""
    try:
        # Get user_id from request body
        data = request.get_json()
        user_id = data.get('user_id') if data else None

        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        # Let the service handle user validation and marking
        success = NotificationService.mark_all_as_read(user_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'All notifications marked as read'
            })
        else:
            return jsonify({'error': 'User not found or failed to mark notifications as read'}), 404
            
    except Exception as e:
        current_app.logger.error(f"Error marking all notifications as read: {str(e)}")
        return jsonify({'error': 'Failed to mark all notifications as read'}), 500

@notification_bp.route('/cleanup', methods=['POST'])
@require_domain_auth
def cleanup_expired_notifications():
    """Clean up expired notifications (admin only)"""
    try:
        # Get user_id from request body
        data = request.get_json()
        user_id = data.get('user_id') if data else None

        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        # Validate user exists and is admin - only fetch user_id and role
        result = get_db_session().query(User.user_id, User.role).filter_by(user_id=user_id).first()
        if not result:
            return jsonify({'error': 'User not found'}), 404

        actual_user_id, user_role = result
        if user_role.value != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        
        count = NotificationService.cleanup_expired_notifications()
        
        return jsonify({
            'success': True,
            'message': f'Cleaned up {count} expired notifications'
        })
        
    except Exception as e:
        current_app.logger.error(f"Error cleaning up notifications: {str(e)}")
        return jsonify({'error': 'Failed to cleanup notifications'}), 500

@notification_bp.route('/test', methods=['POST'])
@require_domain_auth
def create_test_notification():
    """Create a test notification (admin only)"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        admin_user_id = data.get('admin_user_id')
        target_user_id = data.get('target_user_id')
        notification_type = data.get('type', 'test')
        title = data.get('title', 'Test Notification')
        message = data.get('message', 'This is a test notification')
        
        if not admin_user_id or not target_user_id:
            return jsonify({'error': 'admin_user_id and target_user_id are required'}), 400
        
        # Validate admin user - only fetch user_id, role and username
        admin_result = get_db_session().query(User.user_id, User.role, User.username).filter_by(user_id=admin_user_id).first()
        if not admin_result or admin_result[1].value != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        
        admin_actual_id, admin_role, admin_username = admin_result

        # Validate target user - only fetch user_id
        target_user_id_actual = get_db_session().query(User.user_id).filter_by(user_id=target_user_id).scalar()
        if not target_user_id_actual:
            return jsonify({'error': 'Target user not found'}), 404

        notification = NotificationService.create_notification(
            user_id=target_user_id_actual,
            notification_type=notification_type,
            title=title,
            message=message,
            data={'test': True, 'created_by': admin_username}
        )
        
        if notification:
            return jsonify({
                'success': True,
                'message': 'Test notification created',
                'notification': notification.to_dict()
            })
        else:
            return jsonify({'error': 'Failed to create test notification'}), 500
            
    except Exception as e:
        current_app.logger.error(f"Error creating test notification: {str(e)}")
        return jsonify({'error': 'Failed to create test notification'}), 500

@notification_bp.route('/sla-alerts', methods=['POST'])
@require_domain_auth
def trigger_sla_notifications():
    """Trigger SLA breach notifications (admin only)"""
    try:
        data = request.get_json()
        user_id = data.get('user_id') if data else None

        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        # Validate user exists and is admin - only fetch user_id and role
        result = get_db_session().query(User.user_id, User.role).filter_by(user_id=user_id).first()
        if not result:
            return jsonify({'error': 'User not found'}), 404

        actual_user_id, user_role = result
        if user_role.value != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        
        # Get SLA alerts and create notifications
        from app.services.sla_service import SLAService
        alerts = SLAService.check_sla_alerts(create_notifications=True)
        
        return jsonify({
            'success': True,
            'message': f'Processed {len(alerts)} SLA alerts and created notifications',
            'alerts_count': len(alerts)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error triggering SLA notifications: {str(e)}")
        return jsonify({'error': 'Failed to trigger SLA notifications'}), 500

@notification_bp.route('/admin/all', methods=['GET'])
@require_domain_auth
@cache_response(ttl=60)  # Cache for 1 minute
def get_all_notifications_admin():
    """Get all notifications for admin dashboard"""
    try:
        # Get user_id from request parameters (now accepts UUID string)
        user_id = request.args.get('user_id')
        if not user_id or user_id == 'undefined' or user_id == 'null':
            return jsonify({'error': 'user_id is required'}), 400

        # Validate user exists and is admin (now works with UUID) - only fetch user_id and role
        result = get_db_session().query(User.user_id, User.role).filter_by(user_id=user_id).first()
        if not result:
            return jsonify({'error': 'User not found'}), 404

        actual_user_id, user_role = result
        if user_role.value != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        
        # Get query parameters
        limit = request.args.get('limit', 100, type=int)
        notification_type = request.args.get('type')
        
        # Build query
        query = get_db_session().query(Notification)
        
        if notification_type:
            query = query.filter_by(type=notification_type)
        
        notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()
        
        # Group by user for admin view
        user_notifications = {}
        for notification in notifications:
            user_info = notification.user
            if user_info.user_id not in user_notifications:
                user_notifications[user_info.user_id] = {
                    'user': {
                        'id': user_info.user_id,
                        'username': user_info.username,
                        'role': user_info.role.value if user_info.role else None
                    },
                    'notifications': [],
                    'unread_count': 0
                }
            
            user_notifications[user_info.user_id]['notifications'].append(notification.to_dict())
            if not notification.is_read:
                user_notifications[user_info.user_id]['unread_count'] += 1
        
        return jsonify({
            'success': True,
            'user_notifications': list(user_notifications.values()),
            'total_notifications': len(notifications)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error getting all notifications for admin: {str(e)}")
        return jsonify({'error': 'Failed to get notifications'}), 500
