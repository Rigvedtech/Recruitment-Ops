from typing import Optional, Dict, Any
from flask import current_app
from app.models.user import User
from app.services.email_processor import EmailProcessor
from datetime import datetime


class EmailNotificationService:
    """Service to handle email notifications for various events"""
    
    @staticmethod
    def send_new_assignment_email(
        recruiter_username: str,
        request_id: str,
        job_title: str,
        company_name: str,
        requirement_details: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Send email notification for new assignment"""
        try:
            # Find the recruiter user
            user = User.query.filter_by(username=recruiter_username).first()
            if not user:
                current_app.logger.warning(f"Recruiter {recruiter_username} not found for email notification")
                return False
            
            if not user.email:
                current_app.logger.warning(f"Recruiter {recruiter_username} has no email address configured")
                return False
            
            # Create email content
            subject = f"New Assignment - {request_id}: {job_title}"
            html_content = EmailNotificationService._create_assignment_email_template(
                recruiter_username=recruiter_username,
                request_id=request_id,
                job_title=job_title,
                company_name=company_name,
                requirement_details=requirement_details
            )
            
            # Send email using EmailProcessor
            email_processor = EmailProcessor()
            result = email_processor.send_email(
                to_email=user.email,
                subject=subject,
                body=html_content,
                request_id=request_id
            )
            
            if result.get('success', False):
                current_app.logger.info(f"Assignment email sent successfully to {user.email} for {request_id}")
                return True
            else:
                current_app.logger.error(f"Failed to send assignment email to {user.email}: {result.get('error', 'Unknown error')}")
                return False
                
        except Exception as e:
            current_app.logger.error(f"Error sending assignment email to {recruiter_username}: {str(e)}")
            return False
    
    @staticmethod
    def _create_assignment_email_template(
        recruiter_username: str,
        request_id: str,
        job_title: str,
        company_name: str,
        requirement_details: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create HTML email template for new assignment notification"""
        
        # Build requirement details section
        details_html = ""
        if requirement_details:
            details_rows = []
            
            detail_fields = [
                ('Department', 'department'),
                ('Location', 'location'),
                ('Experience Range', 'experience_range'),
                ('Skills Required', 'skills_required'),
                ('Budget CTC', 'budget_ctc'),
                ('Number of Positions', 'number_of_positions'),
                ('Priority', 'priority'),
                ('Tentative DOJ', 'tentative_doj')
            ]
            
            for label, field in detail_fields:
                value = requirement_details.get(field)
                if value:
                    details_rows.append(f"""
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151; width: 180px;">{label}:</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">{value}</td>
                        </tr>
                    """)
            
            if details_rows:
                details_html = f"""
                <div style="margin: 20px 0;">
                    <h3 style="color: #374151; font-size: 16px; font-weight: 600; margin-bottom: 12px;">Requirement Details:</h3>
                    <table style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 6px;">
                        {''.join(details_rows)}
                    </table>
                </div>
                """
        
        # Create the full email template
        html_template = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Assignment - {request_id}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">New Assignment</h1>
                    <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 14px;">You have been assigned a new requirement</p>
                </div>
                
                <!-- Content -->
                <div style="padding: 32px 24px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <div style="background-color: #dbeafe; color: #1e40af; padding: 12px 20px; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 18px;">
                            {request_id}
                        </div>
                    </div>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-bottom: 24px;">
                        <h2 style="color: #1f2937; margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">{job_title}</h2>
                        <p style="color: #6b7280; margin: 0; font-size: 16px;">at <strong style="color: #374151;">{company_name}</strong></p>
                    </div>
                    
                    <div style="margin-bottom: 24px;">
                        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0;">
                            Hello <strong>{recruiter_username}</strong>,<br><br>
                            You have been assigned a new requirement. Please review the details below and start working on this assignment.
                        </p>
                    </div>
                    
                    {details_html}
                    
                    <!-- Call to Action -->
                    <div style="text-align: center; margin: 32px 0 24px 0;">
                        <a href="#" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                            View Requirement Details
                        </a>
                    </div>
                    
                    <!-- Instructions -->
                    <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 16px; margin: 20px 0;">
                        <h4 style="color: #0369a1; margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Next Steps:</h4>
                        <ul style="color: #0c4a6e; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.5;">
                            <li>Review the requirement details carefully</li>
                            <li>Start sourcing candidates matching the criteria</li>
                            <li>Update the status as you progress</li>
                            <li>Reach out if you have any questions</li>
                        </ul>
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f8fafc; padding: 20px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
                    <p style="color: #6b7280; font-size: 12px; margin: 0;">
                        This is an automated notification from the Recruitment Tracking System.<br>
                        Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html_template
