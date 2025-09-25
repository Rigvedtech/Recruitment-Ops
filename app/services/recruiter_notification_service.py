from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy import func
from flask import current_app
from app.database import db
from app.models.user import User
from app.models.profile import Profile
from app.models.requirement import Requirement
from app.models.tracker import Tracker
from app.services.email_processor import EmailProcessor


class RecruiterNotificationService:
    """Service to handle inactive recruiter notifications"""
    
    def __init__(self):
        self.email_processor = EmailProcessor()
    
    def get_inactive_recruiters_for_today(self) -> List[Dict[str, Any]]:
        """
        Get list of recruiters who haven't submitted any profiles today.
        Uses the same logic as the recruiter-activity endpoint.
        """
        try:
            today = datetime.now().date()
            
            # Get all recruiters
            recruiters = User.query.filter_by(role='recruiter').all()
            recruiter_usernames = [r.username for r in recruiters]
            
            # Get profiles submitted today
            profiles_submitted = db.session.query(
                Profile.student_id,
                Profile.candidate_name,
                Profile.created_at
            ).filter(
                func.date(Profile.created_at) == today
            ).all()
            
            # Get all requirements and their assigned recruiters
            all_requirements = db.session.query(
                Requirement.request_id,
                Requirement.assigned_to
            ).all()
            
            # Create a mapping of request_id to assigned recruiters
            requirement_recruiters = {}
            for req in all_requirements:
                if req.assigned_to:
                    recruiters_list = [r.strip() for r in req.assigned_to.split(',') if r.strip()]
                    requirement_recruiters[req.request_id] = recruiters_list
            
            # Get tracker entries to link profiles to requirements
            tracker_entries = db.session.query(
                Tracker.student_id,
                Tracker.request_id
            ).filter(
                Tracker.student_id.in_([p.student_id for p in profiles_submitted])
            ).all()
            
            # Create a mapping of student_id to request_id
            student_to_request = {entry.student_id: entry.request_id for entry in tracker_entries}
            
            # Count profiles per recruiter for today
            recruiter_counts = {}
            for recruiter in recruiter_usernames:
                recruiter_counts[recruiter] = 0
            
            # Count profiles submitted by each recruiter
            for profile in profiles_submitted:
                request_id = student_to_request.get(profile.student_id)
                if request_id and request_id in requirement_recruiters:
                    assigned_recruiters = requirement_recruiters[request_id]
                    for recruiter in assigned_recruiters:
                        if recruiter in recruiter_usernames:
                            recruiter_counts[recruiter] += 1
                            break  # Count only once per profile
            
            # Find inactive recruiters (those with less than 6 profiles submitted today)
            inactive_recruiters = []
            for recruiter in recruiters:
                profiles_count = recruiter_counts.get(recruiter.username, 0)
                if profiles_count < 6:
                    inactive_recruiters.append({
                        'id': recruiter.id,
                        'username': recruiter.username,
                        'email': recruiter.email,
                        'profiles_submitted': profiles_count,
                        'is_active': False
                    })
            
            current_app.logger.info(f"Found {len(inactive_recruiters)} inactive recruiters out of {len(recruiters)} total recruiters")
            return inactive_recruiters
            
        except Exception as e:
            current_app.logger.error(f"Error getting inactive recruiters: {str(e)}")
            return []
    
    def get_recruiter_assigned_job_titles(self, recruiter_username: str) -> List[str]:
        """Get list of job titles assigned to a specific recruiter"""
        try:
            # Get all requirements assigned to this recruiter
            assigned_requirements = db.session.query(
                Requirement.job_title,
                Requirement.request_id,
                Requirement.status
            ).filter(
                Requirement.assigned_to.like(f'%{recruiter_username}%'),
                Requirement.status != 'Closed'  # Exclude closed requirements
            ).all()
            
            # Extract unique job titles
            job_titles = []
            for req in assigned_requirements:
                if req.job_title and req.job_title.strip():
                    job_titles.append(req.job_title.strip())
            
            # Remove duplicates while preserving order
            unique_job_titles = []
            for title in job_titles:
                if title not in unique_job_titles:
                    unique_job_titles.append(title)
            
            return unique_job_titles
            
        except Exception as e:
            current_app.logger.error(f"Error getting assigned job titles for {recruiter_username}: {str(e)}")
            return []

    def generate_inactive_recruiter_email_content(self, recruiter_name: str) -> str:
        """Generate HTML email content for inactive recruiter notification"""
        # Get assigned job titles for this recruiter
        assigned_job_titles = self.get_recruiter_assigned_job_titles(recruiter_name)
        
        # Generate job titles list HTML
        if assigned_job_titles:
            job_titles_html = ""
            for i, title in enumerate(assigned_job_titles, 1):
                job_titles_html += f"<li>{title}</li>"
            
            job_titles_section = f"""
                <p><strong>Your assigned job titles:</strong></p>
                <ul>
                    {job_titles_html}
                </ul>
                <p>Please review these requirements and submit relevant candidate profiles.</p>
            """
        else:
            job_titles_section = """
                <p><strong>Note:</strong> No active job titles are currently assigned to you. Please contact your administrator if you believe this is incorrect.</p>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Daily Profile Submission Reminder</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #f8f9fa;
                    padding: 20px;
                    border-radius: 5px;
                    margin-bottom: 20px;
                }}
                .content {{
                    background-color: #ffffff;
                    padding: 20px;
                    border: 1px solid #dee2e6;
                    border-radius: 5px;
                }}
                .footer {{
                    margin-top: 20px;
                    padding: 15px;
                    background-color: #f8f9fa;
                    border-radius: 5px;
                    font-size: 12px;
                    color: #6c757d;
                }}
                .highlight {{
                    background-color: #fff3cd;
                    border: 1px solid #ffeaa7;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 15px 0;
                }}
                .job-titles {{
                    background-color: #f8f9fa;
                    border: 1px solid #dee2e6;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 15px 0;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h2 style="margin: 0; color: #495057;">Daily Profile Submission Reminder</h2>
            </div>
            
            <div class="content">
                <p>Dear <strong>{recruiter_name}</strong>,</p>
                
                <div class="highlight">
                    <p style="margin: 0;"><strong>You have submitted fewer than 6 profiles today.</strong></p>
                </div>
                
                <p>This is a reminder that as part of your daily responsibilities, you are expected to submit at least 6 candidate profiles for the requirements assigned to you.</p>
                
                <div class="job-titles">
                    {job_titles_section}
                </div>
                
                <p>If you have any questions or need assistance, please contact your administrator.</p>
                
                <p>Thank you for your attention to this matter.</p>
                
                <p>Best regards,<br>
                <strong>Recruitment Ops</strong></p>
            </div>
            
            <div class="footer">
                <p>This is an automated reminder sent by the Recruitment Ops.</p>
                <p>If you believe this message was sent in error, please contact your system administrator.</p>
            </div>
        </body>
        </html>
        """
        return html_content
    
    def send_inactive_recruiter_notifications(self) -> Dict[str, Any]:
        """
        Send email notifications to all inactive recruiters for today.
        Returns a summary of the notification process.
        
        Note: Time and day validation is handled by APScheduler, so this method
        can be called directly when needed or will be triggered automatically.
        """
        try:
            # Optional: Check if it's a weekday (Monday = 0, Sunday = 6)
            # This is a safety check since APScheduler already handles this
            from datetime import datetime
            import pytz
            
            # Use IST timezone for consistency
            ist = pytz.timezone('Asia/Kolkata')
            current_time_ist = datetime.now(ist)
            current_weekday = current_time_ist.weekday()
            
            current_app.logger.info(f"Starting inactive recruiter notification process at {current_time_ist.strftime('%Y-%m-%d %H:%M:%S %Z')}")
            
            if current_weekday >= 5:  # Saturday or Sunday
                current_app.logger.info("Skipping notifications - weekend detected")
                return {
                    'success': True,
                    'message': 'Notifications skipped - weekend',
                    'notifications_sent': 0,
                    'inactive_recruiters': 0,
                    'errors': []
                }
            
            # Get inactive recruiters
            inactive_recruiters = self.get_inactive_recruiters_for_today()
            
            if not inactive_recruiters:
                current_app.logger.info("No inactive recruiters found for today")
                return {
                    'success': True,
                    'message': 'No inactive recruiters found',
                    'notifications_sent': 0,
                    'inactive_recruiters': 0,
                    'errors': []
                }
            
            # Send notifications
            notifications_sent = 0
            errors = []
            
            for recruiter in inactive_recruiters:
                try:
                    if not recruiter['email']:
                        current_app.logger.warning(f"No email address found for recruiter {recruiter['username']}")
                        errors.append(f"No email address for {recruiter['username']}")
                        continue
                    
                    # Generate email content
                    email_content = self.generate_inactive_recruiter_email_content(recruiter['username'])
                    subject = "Insufficient Profile Submissions Today - Action Required"
                    
                    # Send email
                    result = self.email_processor.send_email(
                        to_email=recruiter['email'],
                        subject=subject,
                        body=email_content
                    )
                    
                    if result['success']:
                        notifications_sent += 1
                        current_app.logger.info(f"Notification sent successfully to {recruiter['username']} ({recruiter['email']})")
                    else:
                        errors.append(f"Failed to send email to {recruiter['username']}: {result.get('error', 'Unknown error')}")
                        current_app.logger.error(f"Failed to send notification to {recruiter['username']}: {result.get('error', 'Unknown error')}")
                
                except Exception as e:
                    error_msg = f"Error sending notification to {recruiter['username']}: {str(e)}"
                    errors.append(error_msg)
                    current_app.logger.error(error_msg)
            
            # Return summary
            summary = {
                'success': True,
                'message': f'Notifications sent to {notifications_sent} out of {len(inactive_recruiters)} inactive recruiters',
                'notifications_sent': notifications_sent,
                'inactive_recruiters': len(inactive_recruiters),
                'errors': errors,
                'timestamp': datetime.now().isoformat()
            }
            
            current_app.logger.info(f"Notification process completed: {summary['message']}")
            return summary
            
        except Exception as e:
            current_app.logger.error(f"Error in send_inactive_recruiter_notifications: {str(e)}")
            return {
                'success': False,
                'error': f'Error in notification process: {str(e)}',
                'notifications_sent': 0,
                'inactive_recruiters': 0,
                'errors': [str(e)]
            }
    
    def send_manual_notifications(self) -> Dict[str, Any]:
        """
        Send manual notifications to inactive recruiters (for testing/admin use).
        This bypasses the time/day restrictions.
        """
        try:
            # Get inactive recruiters
            inactive_recruiters = self.get_inactive_recruiters_for_today()
            
            if not inactive_recruiters:
                current_app.logger.info("No inactive recruiters found for today")
                return {
                    'success': True,
                    'message': 'No inactive recruiters found',
                    'notifications_sent': 0,
                    'inactive_recruiters': 0,
                    'errors': []
                }
            
            # Send notifications
            notifications_sent = 0
            errors = []
            
            for recruiter in inactive_recruiters:
                try:
                    if not recruiter['email']:
                        current_app.logger.warning(f"No email address found for recruiter {recruiter['username']}")
                        errors.append(f"No email address for {recruiter['username']}")
                        continue
                    
                    # Generate email content
                    email_content = self.generate_inactive_recruiter_email_content(recruiter['username'])
                    subject = "Insufficient Profile Submissions Today - Action Required (Manual Notification)"
                    
                    # Send email
                    result = self.email_processor.send_email(
                        to_email=recruiter['email'],
                        subject=subject,
                        body=email_content
                    )
                    
                    if result['success']:
                        notifications_sent += 1
                        current_app.logger.info(f"Manual notification sent successfully to {recruiter['username']} ({recruiter['email']})")
                    else:
                        errors.append(f"Failed to send email to {recruiter['username']}: {result.get('error', 'Unknown error')}")
                        current_app.logger.error(f"Failed to send manual notification to {recruiter['username']}: {result.get('error', 'Unknown error')}")
                
                except Exception as e:
                    error_msg = f"Error sending manual notification to {recruiter['username']}: {str(e)}"
                    errors.append(error_msg)
                    current_app.logger.error(error_msg)
            
            # Return summary
            summary = {
                'success': True,
                'message': f'Manual notifications sent to {notifications_sent} out of {len(inactive_recruiters)} inactive recruiters',
                'notifications_sent': notifications_sent,
                'inactive_recruiters': len(inactive_recruiters),
                'errors': errors,
                'timestamp': datetime.now().isoformat(),
                'manual': True
            }
            
            current_app.logger.info(f"Manual notification process completed: {summary['message']}")
            return summary
            
        except Exception as e:
            current_app.logger.error(f"Error in send_manual_notifications: {str(e)}")
            return {
                'success': False,
                'error': f'Error in manual notification process: {str(e)}',
                'notifications_sent': 0,
                'inactive_recruiters': 0,
                'errors': [str(e)]
            }
