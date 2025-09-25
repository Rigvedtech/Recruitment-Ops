"""
Scheduler module for handling scheduled jobs in the Email Tracker application.
"""

from flask_apscheduler import APScheduler
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def send_inactive_recruiter_notifications_job():
    """
    Scheduled job to send inactive recruiter notifications.
    This job runs daily at 5 PM on weekdays.
    """
    try:
        # Import inside function to avoid circular imports
        from flask import current_app
        from app.services.recruiter_notification_service import RecruiterNotificationService
        
        logger.info("Starting scheduled inactive recruiter notification job")
        
        # Check if we're in an app context, create one if needed
        if current_app:
            # We're already in app context
            notification_service = RecruiterNotificationService()
            result = notification_service.send_inactive_recruiter_notifications()
        else:
            # Need to create app context
            from app import create_app
            app = create_app()
            with app.app_context():
                notification_service = RecruiterNotificationService()
                result = notification_service.send_inactive_recruiter_notifications()
        
        if result['success']:
            logger.info(f"Scheduled notification job completed: {result['message']}")
            logger.info(f"Notifications sent: {result['notifications_sent']}")
            logger.info(f"Inactive recruiters found: {result['inactive_recruiters']}")
            
            if result['errors']:
                logger.warning(f"Errors encountered: {result['errors']}")
        else:
            logger.error(f"Scheduled notification job failed: {result.get('error', 'Unknown error')}")
            if result['errors']:
                logger.error(f"Errors: {result['errors']}")
                
    except Exception as e:
        logger.error(f"Critical error in scheduled notification job: {str(e)}", exc_info=True)

def check_sla_breaches_and_notify_job():
    """
    Scheduled job to check for SLA breaches and create notifications.
    This job runs every hour during business hours.
    """
    try:
        # Import inside function to avoid circular imports
        from app.services.sla_service import SLAService
        from app.services.notification_service import NotificationService

        logger.info("Starting scheduled SLA breach notification job")

        # Always create app context for scheduled jobs since they run in separate threads
        from app import create_app_for_job
        app = create_app_for_job()

        with app.app_context():
            # Check for SLA alerts and create notifications
            alerts = SLAService.check_sla_alerts(create_notifications=True)

            if alerts:
                logger.info(f"Found {len(alerts)} SLA breach alerts and created notifications")

                # Cleanup expired notifications while we're here
                cleaned_count = NotificationService.cleanup_expired_notifications()
                if cleaned_count > 0:
                    logger.info(f"Cleaned up {cleaned_count} expired notifications")
            else:
                logger.info("No SLA breaches found")

    except Exception as e:
        logger.error(f"Critical error in SLA breach notification job: {str(e)}", exc_info=True)

def init_scheduler_jobs(scheduler: APScheduler):
    """
    Initialize and register all scheduled jobs.
    
    Args:
        scheduler: APScheduler instance
    """
    try:
        # Add the inactive recruiter notification job
        # This job runs daily at 5 PM (17:00) on weekdays only
        scheduler.add_job(
            id='send_inactive_recruiter_notifications',
            func=send_inactive_recruiter_notifications_job,
            trigger='cron',
            day_of_week='mon-fri',  # Monday to Friday
            hour=17,                # 5 PM
            minute=0,               # At minute 0
            second=0,               # At second 0
            timezone='Asia/Kolkata',  # IST timezone
            replace_existing=True,
            misfire_grace_time=3600  # Allow 1 hour grace time for misfires
        )
        
        # Add the SLA breach notification job
        # This job runs every hour during business hours (9 AM to 6 PM)
        scheduler.add_job(
            id='check_sla_breaches_and_notify',
            func=check_sla_breaches_and_notify_job,
            trigger='cron',
            day_of_week='mon-fri',  # Monday to Friday
            hour='9-18',            # 9 AM to 6 PM
            minute=0,               # At minute 0
            second=0,               # At second 0
            timezone='Asia/Kolkata',  # IST timezone
            replace_existing=True,
            misfire_grace_time=1800  # Allow 30 minutes grace time for misfires
        )
        
        logger.info("Scheduled job 'send_inactive_recruiter_notifications' registered successfully")
        logger.info("Job will run Monday-Friday at 5:00 PM IST")
        logger.info("Scheduled job 'check_sla_breaches_and_notify' registered successfully")
        logger.info("Job will run Monday-Friday every hour from 9:00 AM to 6:00 PM IST")
        
        # Print all registered jobs with detailed information
        jobs = scheduler.get_jobs()
        logger.info(f"Total scheduled jobs: {len(jobs)}")
        
        for job in jobs:
            try:
                # Get next run time with proper timezone handling
                if hasattr(job, 'next_run_time') and job.next_run_time:
                    next_run = job.next_run_time.strftime('%Y-%m-%d %H:%M:%S %Z')
                else:
                    next_run = 'Not scheduled'
                
                logger.info(f"Job: {job.id}")
                logger.info(f"  - Function: {job.func.__name__}")
                logger.info(f"  - Trigger: {job.trigger}")
                logger.info(f"  - Next run: {next_run}")
                
            except Exception as e:
                logger.warning(f"Error getting details for job {job.id}: {str(e)}")
            
    except Exception as e:
        logger.error(f"Error initializing scheduler jobs: {str(e)}", exc_info=True)

def get_scheduler_status():
    """
    Get the current status of the scheduler and all jobs.
    
    Returns:
        dict: Scheduler status information
    """
    try:
        from app import scheduler
        
        jobs = scheduler.get_jobs()
        job_info = []
        
        for job in jobs:
            next_run = job.next_run_time.isoformat() if hasattr(job, 'next_run_time') and job.next_run_time else None
            job_info.append({
                'id': job.id,
                'name': job.name,
                'next_run_time': next_run,
                'trigger': str(job.trigger),
                'func_name': job.func.__name__ if hasattr(job.func, '__name__') else str(job.func)
            })
        
        return {
            'scheduler_running': scheduler.running,
            'total_jobs': len(jobs),
            'jobs': job_info
        }
        
    except Exception as e:
        logger.error(f"Error getting scheduler status: {str(e)}")
        return {
            'error': str(e),
            'scheduler_running': False,
            'total_jobs': 0,
            'jobs': []
        }

def pause_scheduler():
    """Pause the scheduler"""
    try:
        from app import scheduler
        scheduler.pause()
        logger.info("Scheduler paused")
        return {'success': True, 'message': 'Scheduler paused successfully'}
    except Exception as e:
        logger.error(f"Error pausing scheduler: {str(e)}")
        return {'success': False, 'error': str(e)}

def resume_scheduler():
    """Resume the scheduler"""
    try:
        from app import scheduler
        scheduler.resume()
        logger.info("Scheduler resumed")
        return {'success': True, 'message': 'Scheduler resumed successfully'}
    except Exception as e:
        logger.error(f"Error resuming scheduler: {str(e)}")
        return {'success': False, 'error': str(e)}

def run_job_manually(job_id: str):
    """
    Run a specific job manually.
    
    Args:
        job_id: ID of the job to run
        
    Returns:
        dict: Result of the manual job execution
    """
    try:
        from app import scheduler
        
        # Find the job
        job = scheduler.get_job(job_id)
        if not job:
            return {'success': False, 'error': f'Job with ID "{job_id}" not found'}
        
        # Run the job
        logger.info(f"Manually running job: {job_id}")
        job.func()
        
        return {
            'success': True, 
            'message': f'Job "{job_id}" executed successfully',
            'job_id': job_id
        }
        
    except Exception as e:
        logger.error(f"Error running job manually: {str(e)}")
        return {'success': False, 'error': str(e)}
