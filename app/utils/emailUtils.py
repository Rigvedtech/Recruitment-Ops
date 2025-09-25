"""
Utility functions for email processing and profile management
"""
from typing import Dict, Any, Optional
from app.models.profile import Profile
from flask import current_app


def is_duplicate_profile(profile_data: Dict[str, Any]) -> bool:
    """Check if profile is duplicate based on contact, email, and candidate name"""
    contact_no = profile_data.get('contact_no', '').strip()
    email_id = profile_data.get('email_id', '').strip()
    candidate_name = profile_data.get('candidate_name', '').strip()
    
    # Check for duplicates based on the logic:
    # 1. If email is same AND contact is same → It's a duplicate
    # 2. If email is same OR contact is same → It's also a duplicate
    # 3. Only if both email AND contact are different → It's NOT a duplicate
    
    # Check for duplicates by email OR contact
    if email_id:
        existing_profile = Profile.query.filter(Profile.email_id == email_id).first()
        if existing_profile:
            # Handle case where current_app is not available (e.g., in tests)
            try:
                from flask import current_app
                current_app.logger.info(f"Duplicate profile found by email match: {candidate_name} (Email: {email_id})")
            except RuntimeError:
                # current_app not available, just continue
                pass
            return True
    
    # If no email match found, check by contact
    if contact_no:
        existing_profile = Profile.query.filter(Profile.contact_no == contact_no).first()
        if existing_profile:
            try:
                from flask import current_app
                current_app.logger.info(f"Duplicate profile found by contact match: {candidate_name} (Contact: {contact_no})")
            except RuntimeError:
                pass
            return True
    
    return False


def generate_unique_student_id() -> str:
    """Generate a unique student ID with retry logic"""
    max_retries = 10
    for attempt in range(max_retries):
        try:
            last_profile = Profile.query.order_by(Profile.student_id.desc()).first()
            if last_profile and last_profile.student_id.startswith('STU'):
                try:
                    last_number = int(last_profile.student_id[3:])
                    next_number = last_number + 1 + attempt
                except ValueError:
                    next_number = 1 + attempt
            else:
                next_number = 1 + attempt
            
            student_id = f"STU{next_number:03d}"
            existing = Profile.query.filter_by(student_id=student_id).first()
            if not existing:
                return student_id
        except Exception as e:
            # Handle case where current_app is not available (e.g., in tests)
            try:
                from flask import current_app
                current_app.logger.warning(f"Error generating student ID (attempt {attempt + 1}): {str(e)}")
            except RuntimeError:
                # current_app not available, just continue
                pass
            continue
    
    # Fallback: use timestamp-based ID with additional randomness
    import time
    import random
    timestamp = int(time.time() * 1000) % 1000000
    random_suffix = random.randint(100, 999)
    return f"STU{timestamp:06d}{random_suffix}"


def validate_profile_data(profile_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate and clean profile data.
    
    Args:
        profile_data: Raw profile data
        
    Returns:
        Dict[str, Any]: Cleaned and validated profile data
    """
    cleaned_data = {}
    
    # Clean candidate name
    candidate_name = profile_data.get('candidate_name', '').strip()
    if candidate_name and len(candidate_name) > 100:
        candidate_name = candidate_name[:100]
    cleaned_data['candidate_name'] = candidate_name
    
    # Clean contact number
    contact_no = profile_data.get('contact_no', '').strip()
    if contact_no:
        # Remove non-numeric characters except + and -
        import re
        contact_no = re.sub(r'[^\d+\-]', '', contact_no)
    cleaned_data['contact_no'] = contact_no
    
    # Clean email
    email_id = profile_data.get('email_id', '').strip()
    if email_id and '@' not in email_id:
        email_id = None
    cleaned_data['email_id'] = email_id
    
    # Clean numeric fields
    def to_float(val):
        try:
            return float(re.sub(r'[^0-9.]', '', str(val))) if val else None
        except:
            return None
    
    def to_int(val):
        try:
            return int(re.sub(r'[^0-9]', '', str(val))) if val else None
        except:
            return None
    
    cleaned_data['total_experience'] = to_float(profile_data.get('total_experience'))
    cleaned_data['relevant_experience'] = to_float(profile_data.get('relevant_experience'))
    cleaned_data['ctc_current'] = to_float(profile_data.get('ctc_current') or profile_data.get('current_ctc'))
    cleaned_data['ctc_expected'] = to_float(profile_data.get('ctc_expected') or profile_data.get('expected_ctc'))
    cleaned_data['notice_period_days'] = to_int(profile_data.get('notice_period_days') or profile_data.get('notice_period'))
    
    # Clean string fields
    cleaned_data['current_company'] = profile_data.get('current_company', '').strip()
    cleaned_data['location'] = profile_data.get('location', '').strip()
    cleaned_data['education'] = profile_data.get('education', '').strip()
    cleaned_data['key_skills'] = profile_data.get('key_skills', '').strip()
    cleaned_data['source'] = profile_data.get('source', '').strip()
    
    return cleaned_data 