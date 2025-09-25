#!/usr/bin/env python3
"""
Test script for inactive recruiter notifications.
This script can be run manually to test the notification functionality
without time/day restrictions.

Usage:
    python scripts/test_inactive_recruiter_notifications.py
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
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

def test_inactive_recruiter_detection():
    """Test the inactive recruiter detection logic"""
    try:
        logger.info("Testing inactive recruiter detection...")
        
        # Import Flask app and services
        from app import create_app
        from app.services.recruiter_notification_service import RecruiterNotificationService
        
        # Create Flask app context
        app = create_app()
        
        with app.app_context():
            logger.info("Flask app context created successfully")
            
            # Initialize notification service
            notification_service = RecruiterNotificationService()
            
            # Get inactive recruiters
            inactive_recruiters = notification_service.get_inactive_recruiters_for_today()
            
            logger.info(f"Found {len(inactive_recruiters)} inactive recruiters:")
            for recruiter in inactive_recruiters:
                logger.info(f"  - {recruiter['username']} ({recruiter['email']})")
            
            return inactive_recruiters
            
    except Exception as e:
        logger.error(f"Error testing inactive recruiter detection: {str(e)}", exc_info=True)
        return []

def test_email_content_generation():
    """Test email content generation"""
    try:
        logger.info("Testing email content generation...")
        
        # Import Flask app and services
        from app import create_app
        from app.services.recruiter_notification_service import RecruiterNotificationService
        
        # Create Flask app context
        app = create_app()
        
        with app.app_context():
            # Initialize notification service
            notification_service = RecruiterNotificationService()
            
            # Test email content generation
            test_recruiter_name = "Test Recruiter"
            email_content = notification_service.generate_inactive_recruiter_email_content(test_recruiter_name)
            
            logger.info("Email content generated successfully")
            logger.info(f"Email content length: {len(email_content)} characters")
            
            # Save email content to file for inspection
            test_email_file = project_root / 'test_email_content.html'
            with open(test_email_file, 'w', encoding='utf-8') as f:
                f.write(email_content)
            
            logger.info(f"Email content saved to: {test_email_file}")
            
            return email_content
            
    except Exception as e:
        logger.error(f"Error testing email content generation: {str(e)}", exc_info=True)
        return None

def test_manual_notifications():
    """Test manual notification sending (without time restrictions)"""
    try:
        logger.info("Testing manual notification sending...")
        
        # Import Flask app and services
        from app import create_app
        from app.services.recruiter_notification_service import RecruiterNotificationService
        
        # Create Flask app context
        app = create_app()
        
        with app.app_context():
            # Initialize notification service
            notification_service = RecruiterNotificationService()
            
            # Send manual notifications
            result = notification_service.send_manual_notifications()
            
            if result['success']:
                logger.info(f"Manual notification test completed: {result['message']}")
                logger.info(f"Notifications sent: {result['notifications_sent']}")
                logger.info(f"Inactive recruiters found: {result['inactive_recruiters']}")
                
                if result['errors']:
                    logger.warning(f"Errors encountered: {result['errors']}")
            else:
                logger.error(f"Manual notification test failed: {result.get('error', 'Unknown error')}")
                if result['errors']:
                    logger.error(f"Errors: {result['errors']}")
            
            return result
            
    except Exception as e:
        logger.error(f"Error testing manual notifications: {str(e)}", exc_info=True)
        return None

def main():
    """Main test function"""
    logger.info("Starting inactive recruiter notification tests")
    
    # Test 1: Inactive recruiter detection
    logger.info("\n" + "="*50)
    logger.info("TEST 1: Inactive Recruiter Detection")
    logger.info("="*50)
    inactive_recruiters = test_inactive_recruiter_detection()
    
    # Test 2: Email content generation
    logger.info("\n" + "="*50)
    logger.info("TEST 2: Email Content Generation")
    logger.info("="*50)
    email_content = test_email_content_generation()
    
    # Test 3: Manual notifications (only if there are inactive recruiters)
    if inactive_recruiters:
        logger.info("\n" + "="*50)
        logger.info("TEST 3: Manual Notification Sending")
        logger.info("="*50)
        logger.info(f"Found {len(inactive_recruiters)} inactive recruiters. Proceeding with notification test...")
        
        # Ask for confirmation before sending actual emails
        response = input("\nDo you want to send actual email notifications? (y/N): ").strip().lower()
        if response == 'y':
            result = test_manual_notifications()
            if result:
                logger.info("Manual notification test completed successfully")
        else:
            logger.info("Skipping actual email sending as requested")
    else:
        logger.info("\n" + "="*50)
        logger.info("TEST 3: Manual Notification Sending")
        logger.info("="*50)
        logger.info("No inactive recruiters found. Skipping notification test.")
    
    logger.info("\n" + "="*50)
    logger.info("All tests completed")
    logger.info("="*50)

if __name__ == "__main__":
    main()
