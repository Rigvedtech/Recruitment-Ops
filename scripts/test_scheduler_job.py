#!/usr/bin/env python3
"""
Test script to manually trigger the inactive recruiter notification job.
This is useful for testing the scheduler functionality without waiting for the scheduled time.

Usage:
    python scripts/test_scheduler_job.py
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
        logging.FileHandler(project_root / 'logs' / 'test_scheduler.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

def test_inactive_recruiter_notification_job():
    """Test the inactive recruiter notification job manually"""
    try:
        logger.info("Starting manual test of inactive recruiter notification job")
        
        # Import Flask app and services
        from app import create_app
        from app.scheduler import send_inactive_recruiter_notifications_job
        
        # Create Flask app context
        app = create_app()
        
        with app.app_context():
            logger.info("Flask app context created successfully")
            
            # Call the scheduler job function directly
            send_inactive_recruiter_notifications_job()
            
            logger.info("Manual test completed successfully")
        
    except Exception as e:
        logger.error(f"Error during manual test: {str(e)}", exc_info=True)
        return False
    
    return True

def test_scheduler_status():
    """Test getting scheduler status"""
    try:
        logger.info("Testing scheduler status")
        
        from app import create_app
        from app.scheduler import get_scheduler_status
        
        app = create_app()
        with app.app_context():
            status = get_scheduler_status()
            logger.info(f"Scheduler status: {status}")
            
    except Exception as e:
        logger.error(f"Error getting scheduler status: {str(e)}", exc_info=True)

if __name__ == "__main__":
    print("Testing Scheduler Functionality")
    print("=" * 50)
    
    # Test scheduler status
    test_scheduler_status()
    
    print("\n" + "=" * 50)
    
    # Test notification job
    success = test_inactive_recruiter_notification_job()
    
    if success:
        print("\n✅ Test completed successfully!")
        print("Check the logs for detailed information.")
    else:
        print("\n❌ Test failed!")
        print("Check the logs for error details.")
