#!/usr/bin/env python3
"""
Scheduled script to send email notifications to inactive recruiters.
This script should be run daily at 5 PM (Monday-Friday) to notify recruiters
who haven't submitted any profiles today.

Usage:
    python scripts/send_inactive_recruiter_notifications.py

For Windows Task Scheduler:
    python "C:\path\to\Email Tracker\scripts\send_inactive_recruiter_notifications.py"

For Linux/Mac cron:
    0 17 * * 1-5 cd /path/to/Email\ Tracker && python scripts/send_inactive_recruiter_notifications.py
"""

import os
import sys
import logging
from datetime import datetime
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(project_root / 'logs' / 'inactive_recruiter_notifications.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

def main():
    """Main function to send inactive recruiter notifications"""
    try:
        logger.info("Starting inactive recruiter notification process")
        
        # Check if it's a weekday (Monday = 0, Sunday = 6)
        current_weekday = datetime.now().weekday()
        if current_weekday >= 5:  # Saturday or Sunday
            logger.info("Skipping notifications - weekend detected")
            return
        
        # Check if it's 5 PM (17:00) - allow some flexibility (±1 hour)
        current_hour = datetime.now().hour
        if current_hour < 16 or current_hour > 18:
            logger.info(f"Skipping notifications - current hour is {current_hour}, notifications only sent at 5 PM (±1 hour)")
            return
        
        # Import Flask app and services
        from app import create_app
        from app.services.recruiter_notification_service import RecruiterNotificationService
        
        # Create Flask app context
        app = create_app()
        
        with app.app_context():
            logger.info("Flask app context created successfully")
            
            # Initialize notification service
            notification_service = RecruiterNotificationService()
            
            # Send notifications
            result = notification_service.send_inactive_recruiter_notifications()
            
            if result['success']:
                logger.info(f"Notification process completed successfully: {result['message']}")
                logger.info(f"Notifications sent: {result['notifications_sent']}")
                logger.info(f"Inactive recruiters found: {result['inactive_recruiters']}")
                
                if result['errors']:
                    logger.warning(f"Errors encountered: {result['errors']}")
            else:
                logger.error(f"Notification process failed: {result.get('error', 'Unknown error')}")
                if result['errors']:
                    logger.error(f"Errors: {result['errors']}")
        
        logger.info("Inactive recruiter notification process completed")
        
    except Exception as e:
        logger.error(f"Critical error in notification process: {str(e)}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    # Create logs directory if it doesn't exist
    logs_dir = project_root / 'logs'
    logs_dir.mkdir(exist_ok=True)
    
    main()
