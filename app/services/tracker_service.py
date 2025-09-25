# DEPRECATED: This service uses legacy models and should be updated to work with the new PostgreSQL schema
# TODO: Update this service to use the new normalized table structure

from typing import Optional, List, Dict, Any
from datetime import datetime
from flask import current_app
from app.models.tracker import Tracker
from app.models.profile import Profile
from app.models.requirement import Requirement
from app.models.workflow_progress import WorkflowProgress
from app.models.meeting import Meeting
from app.models.status_tracker import StatusTracker
from app.services.notification_service import NotificationService
from app.database import db


class TrackerService:
    """Service class to handle all tracker-related backend operations"""
    
    def __init__(self):
        pass
    
    def create_tracker_entry(self, request_id: str, student_id: str, email_id: str) -> bool:
        """Create a tracker entry for a single student-requirement pair"""
        try:
            # Check if tracker entry already exists for this request_id and student_id
            existing_tracker = Tracker.query.filter_by(
                request_id=request_id, 
                student_id=student_id
            ).first()
            
            if existing_tracker:
                current_app.logger.info(f"Tracker entry already exists: {request_id} -> {student_id}")
                return False
            
            # Create new tracker entry
            tracker = Tracker(
                request_id=request_id,
                student_id=student_id,
                email_id=email_id,
                extracted_at=datetime.utcnow()
            )
            
            db.session.add(tracker)
            db.session.commit()
            
            current_app.logger.info(f"Created new tracker entry: {request_id} -> {student_id}")
            return True
            
        except Exception as e:
            current_app.logger.error(f"Error creating tracker entry: {str(e)}")
            db.session.rollback()
            return False
    
    def get_tracker_by_request_id(self, request_id: str) -> List[Tracker]:
        """Get all tracker entries for a specific request ID"""
        try:
            return Tracker.query.filter_by(request_id=request_id).all()
        except Exception as e:
            current_app.logger.error(f"Error getting tracker by request ID: {str(e)}")
            return []
    
    def get_tracker_by_student_id(self, student_id: str) -> List[Tracker]:
        """Get all tracker entries for a specific student ID"""
        try:
            return Tracker.query.filter_by(student_id=student_id).all()
        except Exception as e:
            current_app.logger.error(f"Error getting tracker by student ID: {str(e)}")
            return []
    
    def get_all_trackers(self) -> List[Tracker]:
        """Get all tracker entries"""
        try:
            return Tracker.query.all()
        except Exception as e:
            current_app.logger.error(f"Error getting all trackers: {str(e)}")
            return []
    
    def get_trackers_by_student_id(self, student_id: str) -> List[Tracker]:
        """Get all tracker entries containing a specific student ID"""
        try:
            return Tracker.query.filter_by(student_id=student_id).all()
        except Exception as e:
            current_app.logger.error(f"Error getting trackers by student ID: {str(e)}")
            return []
    
    def update_tracker_entry(self, request_id: str, student_id: str, **kwargs) -> bool:
        """Update a specific tracker entry"""
        try:
            tracker = Tracker.query.filter_by(
                request_id=request_id, 
                student_id=student_id
            ).first()
            
            if not tracker:
                return False
            
            for key, value in kwargs.items():
                if hasattr(tracker, key):
                    setattr(tracker, key, value)
            
            tracker.updated_at = datetime.utcnow()
            db.session.commit()
            current_app.logger.info(f"Updated tracker entry: {request_id} -> {student_id}")
            return True
        except Exception as e:
            current_app.logger.error(f"Error updating tracker entry: {str(e)}")
            db.session.rollback()
            return False
    
    def delete_tracker_entry(self, request_id: str, student_id: str) -> bool:
        """Delete a specific tracker entry"""
        try:
            tracker = Tracker.query.filter_by(
                request_id=request_id, 
                student_id=student_id
            ).first()
            
            if not tracker:
                return False
            
            db.session.delete(tracker)
            db.session.commit()
            current_app.logger.info(f"Deleted tracker entry: {request_id} -> {student_id}")
            return True
        except Exception as e:
            current_app.logger.error(f"Error deleting tracker entry: {str(e)}")
            db.session.rollback()
            return False
    
    def get_student_count_for_request(self, request_id: str) -> int:
        """Get the number of students tracked for a specific request"""
        try:
            return Tracker.get_student_count_for_request(request_id)
        except Exception as e:
            current_app.logger.error(f"Error getting student count: {str(e)}")
            return 0
    
    def get_onboarded_count_for_request(self, request_id: str) -> int:
        """Get the number of onboarded students for a specific request"""
        try:
            return Tracker.get_onboarded_count_for_request(request_id)
        except Exception as e:
            current_app.logger.error(f"Error getting onboarded count: {str(e)}")
            return 0
    
    def update_onboarding_status(self, request_id: str, student_id: str, onboarded: bool) -> bool:
        """Update onboarding status for a specific student-requirement pair"""
        try:
            return Tracker.update_onboarding_status(request_id, student_id, onboarded)
        except Exception as e:
            current_app.logger.error(f"Error updating onboarding status: {str(e)}")
            return False
    
    def bulk_create_tracker_entries(self, request_id: str, student_ids: List[str], email_id: str) -> int:
        """Create multiple tracker entries for a request"""
        try:
            created_count = 0
            for student_id in student_ids:
                if self.create_tracker_entry(request_id, student_id, email_id):
                    created_count += 1
            
            current_app.logger.info(f"Created {created_count} tracker entries for request: {request_id}")
            return created_count
        except Exception as e:
            current_app.logger.error(f"Error bulk creating tracker entries: {str(e)}")
            return 0
    
    def validate_profile_movement(self, profile_id: str, from_request_id: str, to_request_id: str) -> Dict[str, Any]:
        """
        Validate if a profile can be moved from one requirement to another
        
        Returns:
            Dict with validation results and error messages
        """
        try:
            # Check if source and target are the same
            if from_request_id == to_request_id:
                return {
                    'valid': False,
                    'error': 'Source and target requirements cannot be the same',
                    'error_code': 'SAME_REQUIREMENT'
                }
            
            # Check if source requirement exists and is not deleted/closed
            from_requirement = Requirement.query.filter_by(
                request_id=from_request_id, 
                is_deleted=False
            ).first()
            
            if not from_requirement:
                return {
                    'valid': False,
                    'error': f'Source requirement {from_request_id} not found or is deleted',
                    'error_code': 'SOURCE_REQUIREMENT_NOT_FOUND'
                }
            
            if from_requirement.status == 'Closed':
                return {
                    'valid': False,
                    'error': f'Cannot move profiles from closed requirement {from_request_id}',
                    'error_code': 'SOURCE_REQUIREMENT_CLOSED'
                }
            
            # Check if target requirement exists and is not deleted/closed
            to_requirement = Requirement.query.filter_by(
                request_id=to_request_id, 
                is_deleted=False
            ).first()
            
            if not to_requirement:
                return {
                    'valid': False,
                    'error': f'Target requirement {to_request_id} not found or is deleted',
                    'error_code': 'TARGET_REQUIREMENT_NOT_FOUND'
                }
            
            if to_requirement.status == 'Closed':
                return {
                    'valid': False,
                    'error': f'Cannot move profiles to closed requirement {to_request_id}',
                    'error_code': 'TARGET_REQUIREMENT_CLOSED'
                }
            
            # Check if profile exists and is not deleted
            profile = Profile.query.filter(
                Profile.id == profile_id,
                Profile.deleted_at.is_(None)
            ).first()
            
            if not profile:
                return {
                    'valid': False,
                    'error': f'Profile {profile_id} not found or is deleted',
                    'error_code': 'PROFILE_NOT_FOUND'
                }
            
            # Check if profile is currently associated with source requirement
            current_tracker = Tracker.query.filter_by(
                requirement_id=from_requirement.id,
                profile_id=profile_id
            ).first()
            
            if not current_tracker:
                return {
                    'valid': False,
                    'error': f'Profile {profile.candidate_name} is not associated with requirement {from_request_id}',
                    'error_code': 'PROFILE_NOT_IN_SOURCE'
                }
            
            # Check if profile is already associated with target requirement
            existing_tracker = Tracker.query.filter_by(
                requirement_id=to_requirement.id,
                profile_id=profile_id
            ).first()
            
            if existing_tracker:
                return {
                    'valid': False,
                    'error': f'Profile {profile.candidate_name} is already associated with requirement {to_request_id}',
                    'error_code': 'PROFILE_ALREADY_IN_TARGET'
                }
            
            return {
                'valid': True,
                'profile': profile,
                'from_requirement': from_requirement,
                'to_requirement': to_requirement,
                'current_tracker': current_tracker
            }
            
        except Exception as e:
            current_app.logger.error(f"Error validating profile movement: {str(e)}")
            return {
                'valid': False,
                'error': f'Validation error: {str(e)}',
                'error_code': 'VALIDATION_ERROR'
            }
    
    def reset_workflow_state(self, profile_id: str, from_request_id: str, to_request_id: str) -> bool:
        """
        Reset profile workflow state when moving to new requirement
        """
        try:
            # Get source workflow progress
            from_workflow = WorkflowProgress.get_by_request_id(from_request_id)
            
            # Get target workflow progress (create if doesn't exist)
            to_workflow = WorkflowProgress.get_by_request_id(to_request_id)
            if not to_workflow:
                to_workflow = WorkflowProgress.create_or_update(to_request_id, {})
            
            # Get profile to get student_id
            profile = Profile.query.get(profile_id)
            if not profile:
                current_app.logger.error(f"Profile {profile_id} not found for workflow reset")
                return False
            
            student_id = profile.student_id
            
            # Remove profile from all stages in source workflow
            if from_workflow:
                workflow_stages = [
                    'screening_selected', 'screening_rejected',
                    'interview_scheduled', 'interview_rescheduled',
                    'round1_selected', 'round1_rejected', 'round1_rescheduled',
                    'round2_selected', 'round2_rejected', 'round2_rescheduled',
                    'offered', 'onboarding'
                ]
                
                for stage in workflow_stages:
                    getter_method = f'get_{stage}'
                    setter_method = f'set_{stage}'
                    
                    if hasattr(from_workflow, getter_method) and hasattr(from_workflow, setter_method):
                        current_list = getattr(from_workflow, getter_method)()
                        if student_id in current_list:
                            current_list.remove(student_id)
                            getattr(from_workflow, setter_method)(current_list)
                
                # Update source workflow
                from_workflow.updated_at = datetime.utcnow()
                db.session.add(from_workflow)
            
            # Add profile to newly_added_profiles in target workflow
            newly_added = to_workflow.get_newly_added_profiles()
            if student_id not in newly_added:
                newly_added.append(student_id)
                to_workflow.set_newly_added_profiles(newly_added)
            
            # Set target workflow to initial stage if needed
            if to_workflow.current_step != 'candidate_submission':
                to_workflow.current_step = 'candidate_submission'
            
            # Update target workflow
            to_workflow.updated_at = datetime.utcnow()
            db.session.add(to_workflow)
            
            current_app.logger.info(f"Reset workflow state for profile {student_id} from {from_request_id} to {to_request_id}")
            return True
            
        except Exception as e:
            current_app.logger.error(f"Error resetting workflow state: {str(e)}")
            db.session.rollback()
            return False
    
    def cancel_existing_meetings(self, profile_id: str, from_request_id: str) -> int:
        """
        Cancel all existing meetings for this profile-requirement pair
        
        Returns:
            Number of meetings cancelled
        """
        try:
            # Get profile to get student_id
            profile = Profile.query.get(profile_id)
            if not profile:
                current_app.logger.error(f"Profile {profile_id} not found for meeting cancellation")
                return 0
            
            # Find all meetings for this profile in the source requirement
            meetings = Meeting.query.filter_by(
                request_id=from_request_id,
                candidate_id=profile.student_id
            ).all()
            
            cancelled_count = 0
            for meeting in meetings:
                db.session.delete(meeting)
                cancelled_count += 1
            
            if cancelled_count > 0:
                current_app.logger.info(f"Cancelled {cancelled_count} meetings for profile {profile.student_id} in requirement {from_request_id}")
            
            return cancelled_count
            
        except Exception as e:
            current_app.logger.error(f"Error cancelling meetings: {str(e)}")
            db.session.rollback()
            return 0
    
    def create_movement_audit_log(self, profile_id: str, from_request_id: str, to_request_id: str, moved_by_user: str) -> bool:
        """
        Create audit log entry for profile movement
        """
        try:
            # Get profile details
            profile = Profile.query.get(profile_id)
            if not profile:
                return False
            
            # Create status change record for audit trail
            StatusTracker.add_status_change(
                request_id=to_request_id,
                status=f'Profile Moved From {from_request_id}',
                previous_status='Profile Movement',
                notes=f'Profile {profile.candidate_name} ({profile.student_id}) moved from {from_request_id} to {to_request_id} by {moved_by_user}',
                category_detected='profile_movement',
                auto_commit=False  # Don't commit here, let the main transaction handle it
            )
            
            current_app.logger.info(f"Created audit log for profile movement: {profile.student_id} from {from_request_id} to {to_request_id}")
            return True
            
        except Exception as e:
            current_app.logger.error(f"Error creating movement audit log: {str(e)}")
            return False
    
    def send_movement_notifications(self, profile_id: str, from_request_id: str, to_request_id: str, moved_by_user: str) -> int:
        """
        Send notifications about profile movement
        
        Returns:
            Number of notifications sent
        """
        try:
            # Get requirements and profile details
            from_requirement = Requirement.query.filter_by(request_id=from_request_id).first()
            to_requirement = Requirement.query.filter_by(request_id=to_request_id).first()
            profile = Profile.query.get(profile_id)
            
            if not from_requirement or not to_requirement or not profile:
                return 0
            
            notifications_sent = 0
            
            # Get all unique recipients
            all_recipients = set()
            
            # Add recruiters from source requirement
            from_recruiters = from_requirement.get_assigned_recruiters()
            all_recipients.update(from_recruiters)
            
            # Add recruiters from target requirement
            to_recruiters = to_requirement.get_assigned_recruiters()
            all_recipients.update(to_recruiters)
            
            # Add the user who performed the movement
            all_recipients.add(moved_by_user)
            
            # Create notification for each recipient
            for recipient in all_recipients:
                try:
                    # Find user by username
                    from app.models.user import User
                    user = User.query.filter_by(username=recipient).first()
                    if not user:
                        continue
                    
                    title = f"Profile Moved - {profile.candidate_name}"
                    message = f"Profile {profile.candidate_name} ({profile.student_id}) has been moved from {from_request_id} to {to_request_id} by {moved_by_user}"
                    
                    data = {
                        'profile_id': profile_id,
                        'profile_name': profile.candidate_name,
                        'student_id': profile.student_id,
                        'from_request_id': from_request_id,
                        'to_request_id': to_request_id,
                        'moved_by': moved_by_user,
                        'alert_type': 'profile_movement'
                    }
                    
                    notification = NotificationService.create_notification(
                        user_id=user.user_id,
                        notification_type='profile_movement',
                        title=title,
                        message=message,
                        data=data
                    )
                    
                    if notification:
                        notifications_sent += 1
                        
                except Exception as e:
                    current_app.logger.error(f"Error sending notification to {recipient}: {str(e)}")
                    continue
            
            current_app.logger.info(f"Sent {notifications_sent} notifications for profile movement: {profile.student_id}")
            return notifications_sent
            
        except Exception as e:
            current_app.logger.error(f"Error sending movement notifications: {str(e)}")
            return 0
    
    def move_profile_simple(self, profile_id: str, from_request_id: str, to_request_id: str, moved_by_user: str = None) -> Dict[str, Any]:
        """
        Simple profile movement with workflow reset and meeting cancellation
        
        Returns:
            Dict with operation results
        """
        try:
            # Step 1: Validate the movement
            validation_result = self.validate_profile_movement(profile_id, from_request_id, to_request_id)
            if not validation_result['valid']:
                return {
                    'success': False,
                    'error': validation_result['error'],
                    'error_code': validation_result['error_code']
                }
            
            profile = validation_result['profile']
            from_requirement = validation_result['from_requirement']
            to_requirement = validation_result['to_requirement']
            current_tracker = validation_result['current_tracker']
            
            # Step 2: Perform database operations within transaction
            try:
                # Step 3: Cancel existing meetings
                meetings_cancelled = self.cancel_existing_meetings(profile_id, from_request_id)
                
                # Step 4: Reset workflow state
                workflow_reset = self.reset_workflow_state(profile_id, from_request_id, to_request_id)
                if not workflow_reset:
                    raise Exception("Failed to reset workflow state")
                
                # Step 5: Update tracker entries
                # Delete from source
                db.session.delete(current_tracker)
                
                # Create new tracker entry in target
                new_tracker = Tracker(
                    requirement_id=to_requirement.id,
                    profile_id=profile_id,
                    request_id=to_request_id,  # Update legacy field
                    student_id=profile.student_id,  # Update legacy field
                    extracted_at=datetime.utcnow(),  # Reset extraction time
                    onboarded=False,  # Reset onboarding status
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.session.add(new_tracker)
                
                # Step 6: Create audit log
                audit_created = self.create_movement_audit_log(profile_id, from_request_id, to_request_id, moved_by_user or 'system')
                
                # Step 7: Commit transaction
                db.session.commit()
                
                # Step 8: Send notifications (outside transaction)
                notifications_sent = self.send_movement_notifications(profile_id, from_request_id, to_request_id, moved_by_user or 'system')
                
                current_app.logger.info(f"Successfully moved profile {profile.student_id} from {from_request_id} to {to_request_id}")
                
                return {
                    'success': True,
                    'message': f'Profile {profile.candidate_name} successfully moved from {from_request_id} to {to_request_id}',
                    'data': {
                        'profile_id': profile_id,
                        'profile_name': profile.candidate_name,
                        'student_id': profile.student_id,
                        'from_request_id': from_request_id,
                        'to_request_id': to_request_id,
                        'workflow_reset': workflow_reset,
                        'meetings_cancelled': meetings_cancelled,
                        'notifications_sent': notifications_sent,
                        'audit_created': audit_created,
                        'moved_at': datetime.utcnow().isoformat(),
                        'moved_by': moved_by_user or 'system'
                    }
                }
                
            except Exception as e:
                db.session.rollback()
                raise e
                
        except Exception as e:
            current_app.logger.error(f"Error moving profile {profile_id}: {str(e)}")
            return {
                'success': False,
                'error': f'Failed to move profile: {str(e)}',
                'error_code': 'MOVEMENT_ERROR'
            } 