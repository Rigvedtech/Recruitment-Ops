from flask import Blueprint, jsonify, request, current_app, g
from app.models.requirement import Requirement
from app.models.profile import Profile
# Legacy Tracker model - deprecated, use Profile.requirement_id relationship instead
# from app.models.tracker import Tracker
from app.models.sla_tracker import SLATracker
from app.models.user import User
from app.database import db
from datetime import datetime
import re
from sqlalchemy import func
from sqlalchemy.orm import joinedload
from app.services.email_processor import EmailProcessor
from app.middleware.domain_auth import require_domain_auth
from app.middleware.redis_performance_middleware import cache_response, invalidate_cache_pattern

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

def format_enum_for_display(value):
    """Convert database enum values to user-friendly display format"""
    if not value:
        return value
    # Replace underscores with spaces and title case each word
    return value.replace('_', ' ').title()

tracker_bp = Blueprint('tracker', __name__, url_prefix='/api/tracker')

def _get_assigned_user_display(user_id):
    """Get the display name for assigned user, showing 'Unassigned' if admin is assigned"""
    if not user_id:
        return None
    user = get_db_session().query(User).filter_by(user_id=user_id).first()
    if not user:
        return None
    # Only show recruiters, not admins
    if user.role.value == 'recruiter':
        return user.username
    else:
        return None  # This will be treated as unassigned

def _get_assigned_recruiters_display(requirement_id, session=None):
    """Get the list of assigned recruiters for a requirement, excluding admins"""
    try:
        from app.models.assignment import Assignment
        
        # Use provided session or fall back to get_db_session()
        if session is None:
            session = get_db_session()
        
        assignments = Assignment.get_active_assignments_for_requirement(requirement_id, session=session)
        recruiters = []
        
        for assignment in assignments:
            if assignment.user and assignment.user.role.value == 'recruiter':
                recruiters.append(assignment.user.username)
        
        return recruiters
    except Exception as e:
        current_app.logger.error(f"Error getting assigned recruiters for requirement {requirement_id}: {str(e)}")
        return []

def normalize_subject(subject):
    if not subject:
        return ''
    # Remove common reply/forward prefixes
    return re.sub(r'^(re:|fw:|fwd:)[ ]*', '', subject.strip(), flags=re.IGNORECASE)

def get_breach_time_display(requirement_id):
    """Get breach time display for a requirement"""
    try:
        # Get the most recent breaching SLA tracker entry for this requirement
        from app.models.sla_tracker import SLAStatusEnum
        breaching_tracker = get_db_session().query(SLATracker).filter_by(
            requirement_id=requirement_id,
            sla_status=SLAStatusEnum.breached
        ).order_by(SLATracker.sla_breach_hours.desc()).first()
        
        if not breaching_tracker or not breaching_tracker.sla_breach_hours:
            return None
        
        breach_hours = breaching_tracker.sla_breach_hours
        breach_days = breach_hours / 24
        breach_days_rounded = round(breach_days, 1)
        
        # Format breach time as "X days" or "X hours" if less than 1 day
        if breach_days_rounded >= 1:
            return f"{int(breach_days_rounded)} days"
        else:
            return f"{int(breach_hours)} hours"
    except Exception as e:
        current_app.logger.error(f"Error calculating breach time for {requirement_id}: {str(e)}")
        return None

def get_category_for_requirement(requirement):
    """
    Determine the category for a requirement based on its email subject and content.
    Also check if profiles were extracted from this email.
    """
    # Get email subject from related EmailDetails
    email_subject = ''
    if requirement.email_details:
        email_subject = requirement.email_details[0].email_subject or ''
    email_body = requirement.additional_remarks or ''
    
    # First check if profiles were extracted from this email by looking at profiles linked to this requirement
    profiles_count = get_db_session().query(Profile).filter_by(requirement_id=requirement.requirement_id).count()
    if profiles_count > 0:
        # If profiles were extracted, this is definitely a candidate submission
        current_app.logger.info(f"Found {profiles_count} profiles linked to requirement {requirement.requirement_id}, categorizing as candidate_submission")
        return 'candidate_submission'
    
    # If no profiles found, use the original text-based categorization
    return _categorize_content(email_subject, email_body)

def get_category_for_email(email):
    """
    Determine the category for an email based on its subject and content.
    """
    email_subject = email.get('subject', '') if email else ''
    email_body = email.get('body', '') or email.get('clean_body', '') if email else ''
    
    return _categorize_content(email_subject, email_body)

def _categorize_content(email_subject, email_body):
    """
    Internal function to categorize content based on subject and body.
    """
    # Convert to lowercase for matching
    subject_lower = email_subject.lower()
    body_lower = email_body.lower()
    
    # Define patterns and keywords for each category
    # Note: Order matters - more specific categories should come first
    category_patterns = {
        'interview_scheduled': {
            'subject_keywords': [
                'interview scheduled', 'interview schedule', 'interview arranged',
                'interview confirmed', 'interview setup', 'interview booking',
                'interview appointment', 'interview date', 'interview time',
                'candidates selected for interview', 'profiles selected for interview',
                'interview scheduled for today', 'interview scheduled for tomorrow',
                'interview scheduled for next week', 'interview scheduled for',
                'interview call scheduled', 'technical interview scheduled',
                'hr interview scheduled', 'final interview scheduled'
            ],
            'body_keywords': [
                'interview scheduled', 'interview has been scheduled', 'interview is scheduled',
                'interview arranged', 'interview confirmed', 'interview setup',
                'interview booking', 'interview appointment', 'interview date',
                'interview time', 'candidates selected for interview', 'profiles selected for interview',
                'interview scheduled for today', 'interview scheduled for tomorrow',
                'interview scheduled for next week', 'interview scheduled for',
                'interview call scheduled', 'technical interview scheduled',
                'hr interview scheduled', 'final interview scheduled',
                'interview round scheduled', 'interview process scheduled',
                'interview meeting scheduled', 'interview discussion scheduled',
                'interview evaluation scheduled', 'interview assessment scheduled',
                'interview screening scheduled', 'interview selection scheduled',
                'interview shortlisting scheduled', 'interview finalization scheduled'
            ],
            'patterns': [
                r'(?i)interview\s+scheduled\s+(?:for|on|at)',
                r'(?i)interview\s+(?:has\s+been|is)\s+scheduled',
                r'(?i)(?:candidates?|profiles?)\s+selected\s+for\s+interview',
                r'(?i)interview\s+(?:call|round|process|meeting)\s+scheduled',
                r'(?i)(?:technical|hr|final)\s+interview\s+scheduled',
                r'(?i)interview\s+(?:discussion|evaluation|assessment)\s+scheduled',
                r'(?i)interview\s+(?:screening|selection|shortlisting)\s+scheduled',
                r'(?i)interview\s+finalization\s+scheduled',
                r'(?i)scheduled\s+(?:an?\s+)?interview',
                r'(?i)arranged\s+(?:an?\s+)?interview',
                r'(?i)confirmed\s+(?:an?\s+)?interview',
                r'(?i)setup\s+(?:an?\s+)?interview',
                r'(?i)booked\s+(?:an?\s+)?interview'
            ]
        },
        'candidate_submission': {
            'subject_keywords': [
                'candidate submission', 'profile submission', 'resume submission',
                'candidate profile', 'profiles shared', 'resumes attached',
                'suitable candidates', 'shortlisted candidates', 'cv attached',
                'profiles for', 'candidates for', 'submission for'
            ],
            'body_keywords': [
                'please find attached', 'kindly find attached', 'attached candidate',
                'attached profile', 'candidate profile', 'profile submission',
                'submitting candidates', 'submitting profiles', 'please find below',
                'candidates details', 'profile details', 'resume attached',
                'cv attached', 'suitable candidates', 'shortlisted candidates',
                'sharing profiles', 'sharing candidates', 'enclosed please find'
            ],
            'patterns': [
                r'(?i)(?:please|kindly)\s+find\s+(?:attached|below|enclosed)',
                r'(?i)attach(?:ed|ing)\s+(?:candidate|profile|resume|cv)s?',
                r'(?i)(?:candidate|profile|resume|cv)s?\s+attach(?:ed|ment)',
                r'(?i)submitt?(?:ing|ed)\s+(?:candidate|profile)s?',
                r'(?i)shar(?:ing|ed)\s+(?:candidate|profile)s?\s+(?:for|against)',
                r'(?i)(?:suitable|shortlisted)\s+candidates?\s+for',
                r'(?i)please\s+(?:find|refer|check)\s+(?:the\s+)?(?:below|attached)\s+(?:candidate|profile)s?'
            ]
        },
        'offer_recommendation': {
            'subject_keywords': [
                'offer recommendation', 'offer letter', 'job offer',
                'offer for', 'recommendation for offer', 'selected for offer',
                'offer approval', 'offer extended', 'compensation discussion'
            ],
            'body_keywords': [
                'offer recommendation', 'recommend for offer', 'we can offer',
                'selected for offer', 'offer letter', 'compensation package',
                'salary discussion', 'fitment', 'ctc approved', 'offer approval',
                'pleased to offer', 'extend an offer', 'make an offer',
                'candidate is selected', 'cleared all rounds', 'final round cleared'
            ],
            'patterns': [
                r'(?i)offer\s+recommendation',
                r'(?i)recommend(?:ed|ing)?\s+for\s+(?:an\s+)?offer',
                r'(?i)we\s+(?:can|would\s+like\s+to)\s+(?:make\s+an\s+)?offer',
                r'(?i)(?:candidate|profile)\s+(?:is\s+)?selected\s+for\s+(?:an\s+)?offer',
                r'(?i)pleased\s+to\s+(?:make|extend)\s+an?\s+offer',
                r'(?i)offer\s+(?:letter|approval|package)',
                r'(?i)compensation\s+(?:discussion|package|details)',
                r'(?i)cleared\s+(?:all|final)\s+rounds?'
            ]
        },
        'on_boarding': {
            'subject_keywords': [
                'onboarding', 'on boarding', 'on-boarding', 'joining',
                'joining details', 'onboarding details', 'first day',
                'induction', 'orientation', 'welcome aboard', 'joining formalities'
            ],
            'body_keywords': [
                'onboarding details', 'on boarding details', 'joining details',
                'joining date', 'date of joining', 'reporting details',
                'first day', 'induction program', 'orientation program',
                'joining formalities', 'onboarding process', 'welcome to',
                'reporting time', 'documents required', 'joining documents'
            ],
            'patterns': [
                r'(?i)on[\s-]?boarding\s+(?:details|process|information)',
                r'(?i)joining\s+(?:details|date|formalities|instructions)',
                r'(?i)(?:date|day)\s+of\s+joining',
                r'(?i)report(?:ing)?\s+(?:date|time|details)',
                r'(?i)(?:induction|orientation)\s+(?:program|details|schedule)',
                r'(?i)first\s+day\s+(?:details|information|at)',
                r'(?i)documents?\s+(?:required|needed)\s+for\s+joining',
                r'(?i)welcome\s+(?:to|aboard)'
            ]
        }
    }
    
    # Check each category
    for category, config in category_patterns.items():
        # Check subject keywords
        for keyword in config['subject_keywords']:
            if keyword in subject_lower:
                return category
        
        # Check body keywords
        for keyword in config['body_keywords']:
            if keyword in body_lower:
                return category
        
        # Check regex patterns
        for pattern in config['patterns']:
            if re.search(pattern, subject_lower) or re.search(pattern, body_lower):
                return category
    
    return None

@tracker_bp.route('', methods=['GET'])
@require_domain_auth
@cache_response(ttl=300)  # Cache for 5 minutes
def get_tracker_requirements():
    """Get all RFH requirements with request IDs for the tracker, grouped by thread_id or normalized subject for status."""
    try:
        # Initialize email categorizer
        email_processor = EmailProcessor()
        
        # Get authenticated user placed by domain auth middleware
        current_user = getattr(request, 'current_user', None)
        
        # Get manual requirements (these should always be included regardless of email subject)
        # Exclude project requirements from main tracker and soft-deleted requirements
        manual_query = get_db_session().query(Requirement)\
            .options(
                joinedload(Requirement.email_details),
                joinedload(Requirement.assignments)
            )\
            .filter(Requirement.deleted_at.is_(None))\
            .filter(
                Requirement.requirement_id.isnot(None),
                Requirement.is_manual_requirement == True
            )
        
        # Get automatic requirements (email-based) with existing filters, excluding soft-deleted
        from app.models.email_details import EmailDetails
        automatic_query = get_db_session().query(Requirement)\
            .options(
                joinedload(Requirement.email_details),
                joinedload(Requirement.assignments)
            )\
            .filter(Requirement.deleted_at.is_(None))\
            .join(EmailDetails, Requirement.requirement_id == EmailDetails.requirement_id)\
            .filter(
                Requirement.requirement_id.isnot(None),
                Requirement.is_manual_requirement == False,
                ~EmailDetails.email_subject.like('Re:%'),
                ~EmailDetails.email_subject.like('Fw:%'),
                ~EmailDetails.email_subject.like('Fwd:%'),
                ~EmailDetails.email_subject.like('Forward:%')
            )
        
        # Apply role-based filtering to both manual and automatic requirements
        if current_user and getattr(current_user.role, 'value', None) == 'recruiter':
            # For recruiters, only show requirements assigned to them (Assignment.is_active) or legacy owner
            from sqlalchemy import or_, and_
            from app.models.assignment import Assignment
            from app.models.requirement import RequirementStatusEnum
            manual_query = manual_query.filter(
                or_(
                    Requirement.user_id == current_user.user_id,
                    Requirement.assignments.any(and_(Assignment.user_id == current_user.user_id, Assignment.is_active == True))
                ),
                Requirement.status != RequirementStatusEnum.On_Hold
            )
            automatic_query = automatic_query.filter(
                or_(
                    Requirement.user_id == current_user.user_id,
                    Requirement.assignments.any(and_(Assignment.user_id == current_user.user_id, Assignment.is_active == True))
                ),
                Requirement.status != RequirementStatusEnum.On_Hold
            )
            current_app.logger.info(f"Filtering requirements for recruiter via assignments: {current_user.username}")
        elif current_user and getattr(current_user.role, 'value', None) == 'admin':
            # For admins, show all requirements including on-hold ones
            current_app.logger.info(f"Showing all requirements for admin: {current_user.username}")
        else:
            # For unauthenticated users or unknown roles, show all (or you can restrict this)
            current_app.logger.info("No user authentication found, showing all requirements")
        
        # Get both manual and automatic requirements
        manual_requirements = manual_query.order_by(Requirement.created_at.desc()).all()
        automatic_requirements = automatic_query.order_by(EmailDetails.received_datetime.desc()).all()
        
        # Combine both sets
        requirements = manual_requirements + automatic_requirements
        
        current_app.logger.info(f"Found {len(manual_requirements)} manual requirements and {len(automatic_requirements)} automatic requirements")

        # Group by thread_id if present, else by normalized subject
        thread_groups = {}
        for req in requirements:
            # For manual requirements, use request_id as the group key
            if req.is_manual_requirement:
                group_key = f"manual_{req.requirement_id}"
            else:
                # Use thread_id if available, otherwise use normalized subject
                email_subject = ''
                if req.email_details:
                    email_subject = req.email_details[0].email_subject or ''
                group_key = req.email_details[0].thread_id if req.email_details and req.email_details[0].thread_id else normalize_subject(email_subject)
            
            if group_key not in thread_groups:
                thread_groups[group_key] = []
            thread_groups[group_key].append(req)

        current_app.logger.info(f"Grouped into {len(thread_groups)} thread groups")

        result = []
        for group_key, group in thread_groups.items():
            # For each thread, use the most recent requirement as the primary one
            if len(group) > 1:
                # Sort by received_datetime for automatic requirements, created_at for manual requirements
                def sort_key(req):
                    if req.is_manual_requirement:
                        return req.created_at or datetime.min
                    else:
                        # Get received_datetime from email_details
                        if req.email_details and req.email_details[0].received_datetime:
                            return req.email_details[0].received_datetime
                        return datetime.min
                
                group.sort(key=sort_key, reverse=True)
                primary_req = group[0]
                current_app.logger.info(f"Using primary requirement {primary_req.requirement_id} for thread {group_key}")
                
                # Check if status should be updated based on email category (only for automatic requirements)
                category = None
                if not primary_req.is_manual_requirement:
                    category = get_category_for_requirement(primary_req)
                    current_app.logger.info(f"Processing automatic requirement {primary_req.requirement_id}: current status='{primary_req.status}', detected category='{category}'")
                    
                    # Only update status if it's still in initial states and we have a category
                    if category and primary_req.status in ['Open']:
                        # Map email categories to status values
                        category_to_status = {
                            'candidate_submission': 'Candidate_Submission',
                            'interview_scheduled': 'Interview_Scheduled',
                            'offer_recommendation': 'Offer_Recommendation',
                            'on_boarding': 'On_Boarding',
                            'on_hold': 'On_Hold'
                        }
                        if category in category_to_status:
                            old_status = primary_req.status
                            primary_req.status = category_to_status[category]
                            current_app.logger.info(f"Updated requirement {primary_req.requirement_id} status from '{old_status}' to '{primary_req.status}' based on category '{category}'")
                    else:
                        current_app.logger.info(f"Keeping requirement {primary_req.requirement_id} status as '{primary_req.status}' (already processed)")
                else:
                    current_app.logger.info(f"Processing manual requirement {primary_req.requirement_id}: keeping status as '{primary_req.status}' (no automatic updates)")
                
                current_app.logger.info(f"Email ID {primary_req.requirement_id} set to '{primary_req.status}' (group size > 1, category: {category})")
                
                # Check if this is a new assignment (updated within 24 hours and current user is assigned)
                is_new_assignment = False
                if current_user and current_user.role.value == 'recruiter' and primary_req.updated_at:
                    time_diff = datetime.utcnow() - primary_req.updated_at
                    is_within_24_hours = time_diff.total_seconds() < 24 * 60 * 60  # 24 hours in seconds
                    # Check if current user is assigned to this requirement
                    is_assigned_to_user = (primary_req.user_id == current_user.user_id) if current_user else False
                    is_new_assignment = is_within_24_hours and is_assigned_to_user
                
                # Get email details for the primary requirement
                email_subject = ''
                sender_email = ''
                sender_name = ''
                received_datetime = None
                if primary_req.email_details:
                    email_subject = primary_req.email_details[0].email_subject or ''
                    sender_email = primary_req.email_details[0].sender_email or ''
                    sender_name = primary_req.email_details[0].sender_name or ''
                    received_datetime = primary_req.email_details[0].received_datetime
                elif primary_req.is_manual_requirement:
                    # For manual requirements, use created_at as received_datetime
                    received_datetime = primary_req.created_at
                
                result.append({
                    'id': primary_req.requirement_id,
                    'request_id': primary_req.request_id,
                    'job_title': primary_req.job_title,
                    'email_subject': email_subject,
                    'sender_email': sender_email,
                    'sender_name': sender_name,
                    'company_name': format_enum_for_display(primary_req.company_name),
                    'received_datetime': received_datetime.isoformat() if received_datetime else None,
                    'status': primary_req.status.value if primary_req.status else None,
                    'assigned_to': _get_assigned_user_display(primary_req.user_id),
                    'assigned_recruiters': _get_assigned_recruiters_display(primary_req.requirement_id, session=get_db_session()),
                    'notes': primary_req.notes,
                    'created_at': primary_req.created_at.isoformat() if primary_req.created_at else None,
                    'updated_at': primary_req.updated_at.isoformat() if primary_req.updated_at else None,
                    'thread_id': primary_req.email_details[0].thread_id if primary_req.email_details else None,
                    'additional_remarks': primary_req.additional_remarks,
                    'detected_category': category,
                    'thread_size': len(group),
                    'is_manual_requirement': primary_req.is_manual_requirement,
                    'is_new_assignment': is_new_assignment,
                    # Add all detailed requirement fields for the modal
                    'department': primary_req.department,
                    'location': primary_req.location,
                    'shift': primary_req.shift,
                    'job_type': primary_req.job_type,
                    'hiring_manager': primary_req.hiring_manager,
                    'experience_range': primary_req.experience_range,
                    'skill_id': str(primary_req.skill_id) if primary_req.skill_id else None,
                    'minimum_qualification': primary_req.minimum_qualification,
                    'number_of_positions': primary_req.number_of_positions,
                    'budget_ctc': primary_req.budget_ctc,
                    'priority': primary_req.priority,
                    'tentative_doj': primary_req.tentative_doj.isoformat() if primary_req.tentative_doj else None
                })
            else:
                req = group[0]
                # Check email category first (only for automatic requirements)
                category = None
                if not req.is_manual_requirement:
                    category = get_category_for_requirement(req)
                    current_app.logger.info(f"Processing single automatic requirement {req.requirement_id}: current status='{req.status}', detected category='{category}'")
                    
                    # Only update status if it's still in initial states
                    if category and req.status in ['Open']:
                        # Map email categories to status values
                        category_to_status = {
                            'candidate_submission': 'Candidate_Submission',
                            'interview_scheduled': 'Interview_Scheduled',
                            'offer_recommendation': 'Offer_Recommendation',
                            'on_boarding': 'On_Boarding',
                            'on_hold': 'On_Hold'
                        }
                        if category in category_to_status:
                            old_status = req.status
                            req.status = category_to_status[category]
                            current_app.logger.info(f"Updated requirement {req.requirement_id} status from '{old_status}' to '{req.status}' based on category '{category}'")
                    else:
                        current_app.logger.info(f"Keeping requirement {req.requirement_id} status as '{req.status}' (already processed)")
                else:
                    current_app.logger.info(f"Processing single manual requirement {req.requirement_id}: keeping status as '{req.status}' (no automatic updates)")
                
                # Check if this is a new assignment (updated within 24 hours and current user is assigned)
                is_new_assignment = False
                if current_user and current_user.role.value == 'recruiter' and req.updated_at:
                    time_diff = datetime.utcnow() - req.updated_at
                    is_within_24_hours = time_diff.total_seconds() < 24 * 60 * 60  # 24 hours in seconds
                    # Check if current user is assigned to this requirement
                    is_assigned_to_user = (req.user_id == current_user.user_id) if current_user else False
                    is_new_assignment = is_within_24_hours and is_assigned_to_user
                
                # Get email details for the requirement
                email_subject = ''
                sender_email = ''
                sender_name = ''
                received_datetime = None
                thread_id = None
                if req.email_details:
                    email_subject = req.email_details[0].email_subject or ''
                    sender_email = req.email_details[0].sender_email or ''
                    sender_name = req.email_details[0].sender_name or ''
                    received_datetime = req.email_details[0].received_datetime
                    thread_id = req.email_details[0].thread_id
                elif req.is_manual_requirement:
                    # For manual requirements, use created_at as received_datetime
                    received_datetime = req.created_at
                
                result.append({
                    'id': req.requirement_id,
                    'request_id': req.request_id,
                    'job_title': req.job_title,
                    'email_subject': email_subject,
                    'sender_email': sender_email,
                    'sender_name': sender_name,
                    'company_name': format_enum_for_display(req.company_name),
                    'received_datetime': received_datetime.isoformat() if received_datetime else None,
                    'status': req.status.value if req.status else None,
                    'assigned_to': _get_assigned_user_display(req.user_id),
                    'assigned_recruiters': _get_assigned_recruiters_display(req.requirement_id, session=get_db_session()),
                    'notes': req.notes,
                    'created_at': req.created_at.isoformat() if req.created_at else None,
                    'updated_at': req.updated_at.isoformat() if req.updated_at else None,
                    'thread_id': thread_id,
                    'additional_remarks': req.additional_remarks,
                    'detected_category': category,
                    'thread_size': 1,
                    'is_manual_requirement': req.is_manual_requirement,
                    'is_new_assignment': is_new_assignment,
                    # Add all detailed requirement fields for the modal
                    'department': format_enum_for_display(req.department),
                    'location': req.location,
                    'shift': format_enum_for_display(req.shift),
                    'job_type': format_enum_for_display(req.job_type),
                    'hiring_manager': req.hiring_manager,
                    'experience_range': req.experience_range,
                    'skill_id': str(req.skill_id) if req.skill_id else None,
                    'minimum_qualification': req.minimum_qualification,
                    'number_of_positions': req.number_of_positions,
                    'budget_ctc': req.budget_ctc,
                    'priority': format_enum_for_display(req.priority),
                    'tentative_doj': req.tentative_doj.isoformat() if req.tentative_doj else None,
                    # JD fields
                    'job_description': req.job_description,
                    'jd_path': req.jd_path,
                    'job_file_name': req.job_file_name
                })
        
        # Sort result by priority (Urgent > High > Medium > Low > None)
        priority_order = {'Urgent': 1, 'High': 2, 'Medium': 3, 'Low': 4}
        
        def get_priority_sort_key(item):
            priority = item.get('priority')
            if priority is None or priority == '':
                return 5  # None/empty priorities go last
            return priority_order.get(priority, 5)  # Unknown priorities go last
        
        result.sort(key=get_priority_sort_key)
        
        get_db_session().commit()
        return jsonify(result)
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f"Error in get_tracker_requirements: {str(e)}")
        return jsonify({'error': str(e)}), 500

@tracker_bp.route('/<string:request_id>', methods=['GET'])
@require_domain_auth
@cache_response(ttl=600)  # Cache for 10 minutes
def get_tracker_requirement(request_id):
    """Get a specific tracker requirement by request_id"""
    try:
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'error': 'Requirement not found'}), 404
        
        return jsonify(requirement.to_dict())
    except Exception as e:
        current_app.logger.error(f"Error fetching requirement {request_id}: {str(e)}")
        return jsonify({'error': 'Failed to fetch requirement'}), 500

@tracker_bp.route('/<string:request_id>/profiles', methods=['GET'])
@require_domain_auth
def get_profiles_for_request(request_id):
    """Get all profiles associated with a specific request_id"""
    try:
        # First check if the requirement exists
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'error': 'Requirement not found'}), 404
        
        # Get all profiles linked to this requirement
        profiles = get_db_session().query(Profile).filter(
            Profile.requirement_id == requirement.requirement_id,
            Profile.deleted_at.is_(None)
        ).all()
        
        # Convert to dictionaries
        profiles_data = []
        for profile in profiles:
            profile_dict = profile.to_dict()
            # Note: onboarding status is now stored in the Profile model itself
            # or in a separate onboarding table if needed
            profiles_data.append(profile_dict)
        
        return jsonify({
            'request_id': request_id,
            'profiles_count': len(profiles_data),
            'profiles': profiles_data
        })
        
    except Exception as e:
        current_app.logger.error(f"Error fetching profiles for request {request_id}: {str(e)}")
        return jsonify({'error': 'Failed to fetch profiles'}), 500

@tracker_bp.route('/<string:request_id>', methods=['PUT'])
def update_tracker_requirement(request_id):
    """Update a requirement's tracker fields (status, assigned_to, notes)"""
    try:
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'error': 'Requirement not found'}), 404
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Get current user for role-based validation
        auth_header = request.headers.get('Authorization')
        current_user = None
        
        if auth_header:
            try:
                parts = auth_header.split(' ')
                if len(parts) == 2 and parts[0] == 'Bearer':
                    username = parts[1].strip()
                    from app.models.user import User
                    current_user = get_db_session().query(User).filter_by(username=username).first()
                    if not current_user:
                        current_user = get_db_session().query(User).filter_by(username=f"{username} ").first()
                    if not current_user:
                        if username.endswith(' '):
                            current_user = get_db_session().query(User).filter_by(username=username.rstrip()).first()
            except Exception as e:
                current_app.logger.warning(f"Error parsing auth header: {str(e)}")
        
        # Check if trying to set status to "On Hold" - only admins can do this
        if 'status' in data and data['status'] == 'On_Hold':
            if not current_user or current_user.role.value != 'admin':
                return jsonify({'error': 'Only administrators can set requirements to "On Hold" status'}), 403
        
        # Check if trying to update an "On Hold" requirement - only admins can do this
        if requirement.status == 'On_Hold' and current_user and current_user.role.value == 'recruiter':
            return jsonify({'error': 'Recruiters cannot modify requirements that are on hold'}), 403
        
        # Update allowed fields - now including requirement details
        allowed_fields = [
            'status', 'notes', 'job_title', 'department', 'location', 'shift', 
            'job_type', 'hiring_manager', 'experience_range', 'skills_required', 
            'minimum_qualification', 'number_of_positions', 'budget_ctc', 
            'priority', 'additional_remarks', 'company_name'
        ]
        
        # Helper function to convert display format to enum format
        def convert_to_enum_format(value, field_name):
            if not value:
                return value
            
            # Mapping for specific conversions
            conversions = {
                'company_name': {
                    'Tech Corp': 'Tech_Corp',
                    'Full Time': 'full_time',
                    'Part Time': 'part_time'
                },
                'job_type': {
                    'Full Time': 'full_time',
                    'Part Time': 'part_time'
                },
                'priority': {
                    'High': 'high',
                    'Medium': 'medium', 
                    'Low': 'low',
                    'Urgent': 'urgent'
                },
                'shift': {
                    'Day': 'Day',
                    'Night': 'Night',
                    'Rotational': 'rotational',
                    'Flexible': 'flexible'
                },
                'department': {
                    'Human Resources': 'Human_Resources',
                    'Information Technology': 'Information_Technology',
                    'Product Management': 'Product_Management',
                    'Quality Assurance': 'Quality_Assurance',
                    'Business Development': 'Business_Development',
                    'Customer Support': 'Customer_Support'
                }
            }
            
            # Check if there's a specific conversion for this field and value
            if field_name in conversions and value in conversions[field_name]:
                return conversions[field_name][value]
            
            # Default conversion: replace spaces with underscores and keep case
            return value.replace(' ', '_')
        
        for field in allowed_fields:
            if field in data:
                value = data[field]
                # Convert enum fields to proper format
                if field in ['company_name', 'job_type', 'priority', 'department', 'shift']:
                    # Handle empty strings for enum fields - convert to None
                    if not value or (isinstance(value, str) and value.strip() == ''):
                        value = None
                    else:
                        value = convert_to_enum_format(value, field)
                setattr(requirement, field, value)
        
        # Handle tentative_doj field specially for date conversion
        if 'tentative_doj' in data:
            if data['tentative_doj'] and data['tentative_doj'].strip():
                try:
                    requirement.tentative_doj = datetime.strptime(data['tentative_doj'], '%Y-%m-%d').date()
                except ValueError:
                    current_app.logger.warning(f"Invalid date format for tentative_doj: {data['tentative_doj']}")
                    requirement.tentative_doj = None
            else:
                requirement.tentative_doj = None
        
        # Handle assigned_to field using new Assignment model for multiple recruiters
        from app.models.assignment import Assignment
        
        old_recruiters = set()
        # Get existing assignments (pass domain-aware session)
        existing_assignments = Assignment.get_active_assignments_for_requirement(requirement.requirement_id, session=get_db_session())
        for assignment in existing_assignments:
            if assignment.user and assignment.user.username:
                old_recruiters.add(assignment.user.username)
        
        new_recruiters = set()
        
        if 'assigned_to' in data:
            recruiter_usernames = []
            if isinstance(data['assigned_to'], list):
                recruiter_usernames = data['assigned_to']
            else:
                recruiter_usernames = [data['assigned_to']]
            
            # Validate all recruiters and get their user_ids
            recruiter_user_ids = []
            for username in recruiter_usernames:
                if username:  # Skip empty usernames
                    user = get_db_session().query(User).filter_by(username=username).first()
                    if user:
                        # Only allow assignment to recruiters, not admins
                        if user.role.value != 'recruiter':
                            return jsonify({'error': f'Only recruiters can be assigned to requirements. {username} is not a recruiter.'}), 400
                        recruiter_user_ids.append(user.user_id)
                        new_recruiters.add(user.username)
            
            # Deactivate all existing assignments first
            for assignment in existing_assignments:
                assignment.deactivate()
            
            # Assign new recruiters using the Assignment model (pass domain-aware session)
            if recruiter_user_ids:
                assigned_by_user_id = current_user.user_id if current_user else None
                Assignment.assign_recruiters_to_requirement(
                    requirement_id=requirement.requirement_id,
                    recruiter_user_ids=recruiter_user_ids,
                    assigned_by=assigned_by_user_id,
                    session=get_db_session()
                )
                
                # For backward compatibility, set the primary recruiter (first one) on requirement
                requirement.user_id = recruiter_user_ids[0]
            else:
                # If no recruiters assigned, clear the requirement's user_id
                requirement.user_id = None
        
        # Create notifications and send emails for newly assigned recruiters
        newly_assigned = new_recruiters - old_recruiters
        if newly_assigned:
            try:
                from app.services.notification_service import NotificationService
                
                # Prepare requirement details for email
                requirement_details = {
                    'department': requirement.department,
                    'location': requirement.location,
                    'experience_range': requirement.experience_range,
                    'skill_id': str(requirement.skill_id) if requirement.skill_id else None,
                    'budget_ctc': requirement.budget_ctc,
                    'number_of_positions': requirement.number_of_positions,
                    'priority': requirement.priority,
                    'tentative_doj': requirement.tentative_doj.strftime('%Y-%m-%d') if requirement.tentative_doj else None
                }
                
                for recruiter_username in newly_assigned:
                    NotificationService.create_new_assignment_notification_with_email(
                        recruiter_username=recruiter_username,
                        request_id=requirement.request_id,
                        job_title=requirement.job_title or 'Unknown Position',
                        company_name=requirement.company_name or 'Unknown Company',
                        requirement_details=requirement_details
                    )
                
                current_app.logger.info(f"Created assignment notifications and emails for newly assigned recruiters: {newly_assigned}")
            except Exception as e:
                current_app.logger.error(f"Error creating assignment notifications and emails: {str(e)}")
        
        # Update the updated_at timestamp
        requirement.updated_at = datetime.utcnow()
        
        # Auto-start SLA tracking for workflow steps based on status change
        try:
            from app.services.sla_service import SLAService
            # Get the username for the assigned user (if any) - only fetch username
            assigned_recruiter = None
            user_id = None
            if requirement.user_id:
                assigned_recruiter = get_db_session().query(User.username).filter_by(user_id=requirement.user_id).scalar()
                user_id = str(requirement.user_id)
            
            started_trackers = SLAService.auto_start_workflow_steps(
                requirement_id=str(requirement.requirement_id),
                current_status=requirement.status if requirement.status else 'Open',
                user_id=user_id
            )
            current_app.logger.info(f"Auto-started {len(started_trackers)} SLA tracking entries for {request_id}")
        except Exception as e:
            current_app.logger.error(f"Error auto-starting SLA tracking for {request_id}: {str(e)}")
        
        get_db_session().commit()
        
        current_app.logger.info(f"Updated requirement {request_id}: {data}")
        return jsonify(requirement.to_dict())
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f"Error updating requirement: {str(e)}")
        return jsonify({'error': 'Failed to update requirement'}), 500

@tracker_bp.route('/<string:request_id>', methods=['DELETE'])
def delete_tracker_requirement(request_id):
    """Soft delete a requirement (admin only)"""
    try:
        # Get current user for role-based validation
        auth_header = request.headers.get('Authorization')
        current_user = None
        
        if auth_header:
            try:
                parts = auth_header.split(' ')
                if len(parts) == 2 and parts[0] == 'Bearer':
                    username = parts[1].strip()
                    from app.models.user import User
                    current_user = get_db_session().query(User).filter_by(username=username).first()
                    if not current_user:
                        current_user = get_db_session().query(User).filter_by(username=f"{username} ").first()
                    if not current_user:
                        if username.endswith(' '):
                            current_user = get_db_session().query(User).filter_by(username=username.rstrip()).first()
            except Exception as e:
                current_app.logger.warning(f"Error parsing auth header: {str(e)}")
        
        # Only admins can delete requirements
        if not current_user or current_user.role.value != 'admin':
            return jsonify({'error': 'Only administrators can archive requirements'}), 403
        
        # Get the requirement (including already soft-deleted ones)
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'error': 'Requirement not found'}), 404
        
        # Check if already soft deleted
        if requirement.is_deleted:
            return jsonify({'error': 'Requirement is already archived'}), 400
        
        # Perform soft delete
        requirement.soft_delete(deleted_by_user=current_user.user_id)
        get_db_session().commit()
        
        current_app.logger.info(f"Successfully archived requirement {request_id} by {current_user.username}")
        return jsonify({
            'message': f'Successfully archived requirement {request_id}',
            'archived_at': requirement.deleted_at.isoformat() if requirement.deleted_at else None,
            'archived_by': current_user.username
        })
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f"Error archiving requirement {request_id}: {str(e)}")
        return jsonify({'error': f'Failed to archive requirement: {str(e)}'}), 500

@tracker_bp.route('/<string:request_id>/restore', methods=['POST'])
def restore_tracker_requirement(request_id):
    """Restore a soft-deleted requirement (admin only)"""
    try:
        # Get current user for role-based validation
        auth_header = request.headers.get('Authorization')
        current_user = None
        
        if auth_header:
            try:
                parts = auth_header.split(' ')
                if len(parts) == 2 and parts[0] == 'Bearer':
                    username = parts[1].strip()
                    from app.models.user import User
                    current_user = get_db_session().query(User).filter_by(username=username).first()
                    if not current_user:
                        current_user = get_db_session().query(User).filter_by(username=f"{username} ").first()
                    if not current_user:
                        if username.endswith(' '):
                            current_user = get_db_session().query(User).filter_by(username=username.rstrip()).first()
            except Exception as e:
                current_app.logger.warning(f"Error parsing auth header: {str(e)}")
        
        # Only admins can restore requirements
        if not current_user or current_user.role.value != 'admin':
            return jsonify({'error': 'Only administrators can restore archived requirements'}), 403
        
        # Get the requirement (including soft-deleted ones)
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'error': 'Requirement not found'}), 404
        
        # Check if it's actually soft deleted
        if not requirement.is_deleted:
            return jsonify({'error': 'Requirement is not archived'}), 400
        
        # Restore the requirement
        requirement.restore()
        get_db_session().commit()
        
        current_app.logger.info(f"Successfully restored requirement {request_id} by {current_user.username}")
        return jsonify({
            'message': f'Successfully restored requirement {request_id}',
            'restored_by': current_user.username,
            'requirement': requirement.to_dict()
        })
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f"Error restoring requirement {request_id}: {str(e)}")
        return jsonify({'error': f'Failed to restore requirement: {str(e)}'}), 500

@tracker_bp.route('/archived', methods=['GET'])
def get_archived_requirements():
    """Get all archived (soft-deleted) requirements (admin only)"""
    try:
        # Prefer middleware-populated authenticated user (JWT + Redis)
        current_user = getattr(request, 'current_user', None)
        if not current_user:
            # Fallback: support legacy header-based username for backward compatibility
            auth_header = request.headers.get('Authorization')
            if auth_header:
                try:
                    parts = auth_header.split(' ')
                    if len(parts) == 2 and parts[0] == 'Bearer':
                        from app.models.user import User
                        username = parts[1].strip()
                        # Try decode as JWT to extract identity/subject
                        try:
                            from flask_jwt_extended import decode_token
                            token_data = decode_token(username)
                            username = token_data.get('sub') or token_data.get('identity') or username
                        except Exception:
                            pass
                        current_user = get_db_session().query(User).filter_by(username=username).first() or \
                                       get_db_session().query(User).filter_by(username=f"{username} ").first() or \
                                       (get_db_session().query(User).filter_by(username=username.rstrip()).first() if username.endswith(' ') else None)
                except Exception:
                    pass
        
        # Only admins can view archived requirements
        if not current_user or getattr(getattr(current_user, 'role', None), 'value', None) != 'admin':
            return jsonify({'error': 'Only administrators can view archived requirements'}), 403
        
        # Get all archived requirements
        archived_requirements = get_db_session().query(Requirement).filter(Requirement.deleted_at.isnot(None)).order_by(Requirement.deleted_at.desc()).all()
        
        return jsonify([req.to_dict() for req in archived_requirements])
        
    except Exception as e:
        current_app.logger.error(f"Error fetching archived requirements: {str(e)}")
        return jsonify({'error': 'Failed to fetch archived requirements'}), 500

@tracker_bp.route('/stats', methods=['GET'])
@cache_response(ttl=300)  # Cache for 5 minutes
def get_tracker_stats():
    """Get tracker statistics"""
    try:
        # Get manual requirements (these should always be included regardless of email subject)
        manual_base_filter = [
            Requirement.requirement_id.isnot(None),
            Requirement.is_manual_requirement == True
        ]
        
        # Get automatic requirements (email-based) with existing filters
        from app.models.email_details import EmailDetails
        automatic_base_filter = [
            Requirement.requirement_id.isnot(None),
            Requirement.is_manual_requirement == False,
            ~EmailDetails.email_subject.like('Re:%'),
            ~EmailDetails.email_subject.like('Fw:%'),
            ~EmailDetails.email_subject.like('Fwd:%'),
            ~EmailDetails.email_subject.like('Forward:%')
        ]
        
        # Combine counts for both manual and automatic requirements (excluding soft-deleted)
        # For automatic requirements, we need to join with EmailDetails
        from app.models.email_details import EmailDetails
        automatic_query_base = get_db_session().query(Requirement).filter(Requirement.deleted_at.is_(None)).join(EmailDetails, Requirement.requirement_id == EmailDetails.requirement_id)
        
        total_rfh = get_db_session().query(Requirement).filter(Requirement.deleted_at.is_(None)).filter(*manual_base_filter).count() + automatic_query_base.filter(*automatic_base_filter).count()
        
        open_rfh = (get_db_session().query(Requirement).filter(Requirement.deleted_at.is_(None)).filter(*manual_base_filter, Requirement.status == 'Open').count() + 
                   automatic_query_base.filter(*automatic_base_filter, Requirement.status == 'Open').count())
        
        candidate_submission_rfh = (get_db_session().query(Requirement).filter(Requirement.deleted_at.is_(None)).filter(*manual_base_filter, Requirement.status == 'Candidate_Submission').count() + 
                                   automatic_query_base.filter(*automatic_base_filter, Requirement.status == 'Candidate_Submission').count())
        
        interview_scheduled_rfh = (get_db_session().query(Requirement).filter(Requirement.deleted_at.is_(None)).filter(*manual_base_filter, Requirement.status == 'Interview_Scheduled').count() + 
                                  automatic_query_base.filter(*automatic_base_filter, Requirement.status == 'Interview_Scheduled').count())
        
        offer_recommendation_rfh = (get_db_session().query(Requirement).filter(Requirement.deleted_at.is_(None)).filter(*manual_base_filter, Requirement.status == 'Offer_Recommendation').count() + 
                                   automatic_query_base.filter(*automatic_base_filter, Requirement.status == 'Offer_Recommendation').count())
        
        on_boarding_rfh = (get_db_session().query(Requirement).filter(Requirement.deleted_at.is_(None)).filter(*manual_base_filter, Requirement.status == 'On_Boarding').count() + 
                          automatic_query_base.filter(*automatic_base_filter, Requirement.status == 'On_Boarding').count())
        
        on_hold_rfh = (get_db_session().query(Requirement).filter(Requirement.deleted_at.is_(None)).filter(*manual_base_filter, Requirement.status == 'On_Hold').count() + 
                      automatic_query_base.filter(*automatic_base_filter, Requirement.status == 'On_Hold').count())
        
        closed_rfh = (get_db_session().query(Requirement).filter(Requirement.deleted_at.is_(None)).filter(*manual_base_filter, Requirement.status == 'Closed').count() + 
                     automatic_query_base.filter(*automatic_base_filter, Requirement.status == 'Closed').count())
        
        return jsonify({
            'total': total_rfh,
            'open': open_rfh,
            'candidate_submission': candidate_submission_rfh,
            'interview_scheduled': interview_scheduled_rfh,
            'offer_recommendation': offer_recommendation_rfh,
            'on_boarding': on_boarding_rfh,
            'on_hold': on_hold_rfh,
            'closed': closed_rfh
        })
    except Exception as e:
        current_app.logger.error(f"Error fetching tracker stats: {str(e)}")
        return jsonify({
            'total': 0,
            'open': 0,
            'candidate_submission': 0,
            'interview_scheduled': 0,
            'offer_recommendation': 0,
            'on_boarding': 0,
            'on_hold': 0,
            'closed': 0
        })  # Return zero stats instead of error

# New tracker endpoints for requirement-profile relationships
@tracker_bp.route('/relationships', methods=['GET'])
def get_tracker_relationships():
    """Get all relationships between requirements and profiles"""
    try:
        # Get all requirements with their linked profiles (excluding reply emails)
        from app.models.email_details import EmailDetails
        requirements = get_db_session().query(Requirement).join(
            EmailDetails, Requirement.requirement_id == EmailDetails.requirement_id
        ).filter(
            ~EmailDetails.email_subject.like('Re:%'),
            ~EmailDetails.email_subject.like('Fw:%'),
            ~EmailDetails.email_subject.like('Fwd:%'),
            ~EmailDetails.email_subject.like('Forward:%')
        ).all()
        
        # Group by request_id to aggregate data
        grouped_data = {}
        for requirement in requirements:
            if requirement.requirement_id not in grouped_data:
                grouped_data[requirement.requirement_id] = {
                    'id': str(requirement.requirement_id),
                    'request_id': requirement.requirement_id,
                    'student_ids': [],
                    'student_count': 0,
                    'extracted_at': requirement.created_at.isoformat() if requirement.created_at else None,
                    'email_id': requirement.requirement_id,
                    'requirement': {
                        'job_title': requirement.job_title,
                        'email_subject': requirement.email_details[0].email_subject if requirement.email_details else '',
                        'sender_name': requirement.email_details[0].sender_name if requirement.email_details else '',
                        'company_name': format_enum_for_display(requirement.company_name)
                    },
                    'profiles': [],
                    'onboarded_count': 0
                }
            
            # Get profiles linked to this requirement
            profiles = get_db_session().query(Profile).filter(
                Profile.requirement_id == requirement.requirement_id,
                Profile.deleted_at.is_(None)
            ).all()
            
            for profile in profiles:
                # Add student_id to the list
                grouped_data[requirement.requirement_id]['student_ids'].append(profile.student_id)
                grouped_data[requirement.requirement_id]['student_count'] += 1

                profile_data = {
                    'student_id': profile.student_id,
                    'candidate_name': profile.candidate_name,
                    'current_company': profile.current_company,
                    'total_experience': profile.total_experience,
                    'key_skills': profile.key_skills,
                    'onboarded': False  # TODO: Get from onboarding status
                }
                grouped_data[requirement.requirement_id]['profiles'].append(profile_data)
        
        # Convert grouped data to list
        result = list(grouped_data.values())
        
        return jsonify(result)
    except Exception as e:
        current_app.logger.error(f"Error fetching relationships: {str(e)}")
        return jsonify({'error': 'Failed to fetch relationships'}), 500

@tracker_bp.route('/relationships/request/<string:request_id>', methods=['GET'])
def get_tracker_relationships_by_request(request_id):
    """Get all profiles associated with a specific requirement"""
    try:
        # Get the requirement
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({
                'request_id': request_id,
                'profiles_count': 0,
                'profiles': []
            })
        
        # Get all profiles linked to this requirement
        profiles = get_db_session().query(Profile).filter(
            Profile.requirement_id == requirement.requirement_id,
            Profile.deleted_at.is_(None)
        ).all()
        
        if not profiles:
            return jsonify({
                'request_id': request_id,
                'profiles_count': 0,
                'profiles': []
            })
        
        # Convert profiles to response format
        profiles_data = []
        student_ids = []
        onboarded_student_ids = []
        
        for profile in profiles:
            student_ids.append(profile.student_id)
            profile_data = {
                'student_id': profile.student_id,
                'candidate_name': profile.candidate_name,
                'current_company': profile.current_company,
                'total_experience': profile.total_experience,
                'key_skills': profile.key_skills,
                'ctc_current': profile.ctc_current,
                'ctc_expected': profile.ctc_expected,
                'location': profile.location,
                'contact_no': profile.contact_no,
                'email_id': profile.email_id,
                'onboarded': profile.status and profile.status.value == 'onboarded',
                'extracted_at': profile.created_at.isoformat() if profile.created_at else None
            }
            profiles_data.append(profile_data)
        
        # Calculate onboarding statistics
        onboarded_count = len([p for p in profiles if p.status and p.status.value == 'onboarded'])
        
        return jsonify({
            'request_id': request_id,
            'student_ids': student_ids,
            'profiles_count': len(profiles_data),
            'extracted_at': requirement.created_at.isoformat() if requirement.created_at else None,
            'email_id': requirement.id,
            'onboarded_student_ids': onboarded_student_ids,
            'onboarded_student_ids_list': onboarded_student_ids,  # Add this for frontend compatibility
            'onboarded_count': onboarded_count,
            'profiles': profiles_data
        })
    except Exception as e:
        current_app.logger.error(f"Error fetching relationships by request: {str(e)}")
        return jsonify({'error': 'Failed to fetch relationships'}), 500

@tracker_bp.route('/relationships/student/<string:student_id>', methods=['GET'])
def get_tracker_relationships_by_student(student_id):
    """Get all requirements associated with a specific student profile"""
    try:
        # First find the profile by student_id
        profile = get_db_session().query(Profile).filter(
            Profile.student_id == student_id,
            Profile.deleted_at.is_(None)
        ).first()
        if not profile:
            return jsonify({'success': False, 'error': 'Profile not found'}), 404

        # Find the requirement linked to this profile
        if not profile.requirement_id:
            return jsonify({
                'student_id': student_id,
                'requirements_count': 0,
                'requirements': []
            })

        requirement = get_db_session().query(Requirement).filter_by(requirement_id=profile.requirement_id).first()
        if not requirement:
            return jsonify({
                'student_id': student_id,
                'requirements_count': 0,
                'requirements': []
            })
        
        result = [{
            'id': str(profile.profile_id),
            'request_id': requirement.requirement_id,
            'student_id': student_id,
            'extracted_at': profile.created_at.isoformat() if profile.created_at else None,
            'email_id': requirement.requirement_id,
            'onboarded': False,  # TODO: Get from onboarding status
            'requirement': {
                'request_id': requirement.requirement_id,
                'job_title': requirement.job_title,
                'email_subject': requirement.email_details[0].email_subject if requirement.email_details else '',
                'sender_name': requirement.email_details[0].sender_name if requirement.email_details else '',
                'company_name': format_enum_for_display(requirement.company_name),
                'location': requirement.location,
                'experience_range': requirement.experience_range,
                'skill_id': str(requirement.skill_id) if requirement.skill_id else None,
                'budget_ctc': requirement.budget_ctc
            }
        }]
        
        return jsonify({
            'student_id': student_id,
            'requirements_count': len(result),
            'requirements': result
        })
    except Exception as e:
        current_app.logger.error(f"Error fetching relationships by student: {str(e)}")
        return jsonify({'error': 'Failed to fetch relationships'}), 500

@tracker_bp.route('/relationships/stats', methods=['GET'])
def get_tracker_relationship_stats():
    """Get statistics about relationships between requirements and profiles"""
    try:
        # Count total relationships (profiles linked to requirements)
        total_relationships = get_db_session().query(Profile).filter(
            Profile.requirement_id.isnot(None),
            Profile.deleted_at.is_(None)
        ).count()
        
        # Count unique requirements that have profiles
        unique_requirements = get_db_session().query(Profile.requirement_id).filter(
            Profile.requirement_id.isnot(None),
            Profile.deleted_at.is_(None)
        ).distinct().count()
        
        # Count unique profiles
        unique_profiles = get_db_session().query(Profile).filter(
            Profile.deleted_at.is_(None)
        ).count()
        
        # Get top requirements by profile count
        top_requirements = []
        requirement_counts = get_db_session().query(
            Profile.requirement_id,
            func.count(Profile.profile_id).label('profile_count')
        ).filter(
            Profile.requirement_id.isnot(None),
            Profile.deleted_at.is_(None)
        ).group_by(Profile.requirement_id).order_by(
            func.count(Profile.profile_id).desc()
        ).limit(10).all()
        
        for req_id, count in requirement_counts:
            requirement = get_db_session().query(Requirement).filter_by(requirement_id=req_id).first()
            if requirement:
                top_requirements.append({
                    'request_id': requirement.requirement_id,
                    'job_title': requirement.job_title,
                    'profile_count': count
                })
        
        # Get recent extractions
        recent_extractions = []
        recent_profiles = get_db_session().query(Profile).filter(
            Profile.requirement_id.isnot(None),
            Profile.deleted_at.is_(None)
        ).order_by(Profile.created_at.desc()).limit(10).all()
        
        for profile in recent_profiles:
            requirement = get_db_session().query(Requirement).filter_by(requirement_id=profile.requirement_id).first()
            if requirement:
                recent_extractions.append({
                    'request_id': requirement.requirement_id,
                    'student_id': profile.student_id,
                    'extracted_at': profile.created_at.isoformat() if profile.created_at else None,
                    'job_title': requirement.job_title,
                    'candidate_name': profile.candidate_name
                })
        
        return jsonify({
            'total_relationships': total_relationships,
            'unique_requirements': unique_requirements,
            'unique_profiles': unique_profiles,
            'top_requirements': top_requirements,
            'recent_extractions': recent_extractions
        })
    except Exception as e:
        current_app.logger.error(f"Error fetching relationship stats: {str(e)}")
        return jsonify({'error': 'Failed to fetch relationship stats'}), 500 

@tracker_bp.route('/emails/categorized', methods=['GET'])
def get_categorized_emails():
    """Get all emails categorized by their content (Candidate Submission, Interview Scheduled, etc.)"""
    try:
        # Initialize services
        email_processor = EmailProcessor()
        
        # Fetch all emails (no date limit)
        days = request.args.get('days', default=None, type=int)
        emails = email_processor.fetch_emails(days)
        
        # Filter for hiring/RFH emails only
        hiring_emails = []
        for email in emails:
            if email_processor._is_hiring_email(email):
                hiring_emails.append(email)
        
        # Categorize emails
        categorized_emails = {
            'candidate_submission': [],
            'interview_scheduled': [],
            'offer_recommendation': [],
            'on_boarding': [],
            'uncategorized': []
        }

        for email in hiring_emails:
            category = get_category_for_email(email)
            if category:
                categorized_emails[category].append(email)
            else:
                categorized_emails['uncategorized'].append(email)
        
        # Add statistics
        stats = {
            'total_emails': len(hiring_emails),
            'candidate_submission': len(categorized_emails['candidate_submission']),
            'interview_scheduled': len(categorized_emails['interview_scheduled']),
            'offer_recommendation': len(categorized_emails['offer_recommendation']),
            'on_boarding': len(categorized_emails['on_boarding']),
            'uncategorized': len(categorized_emails['uncategorized'])
        }
        
        return jsonify({
            'stats': stats,
            'categorized_emails': categorized_emails
        })
        
    except Exception as e:
        current_app.logger.error(f"Error in get_categorized_emails: {str(e)}")
        return jsonify({'error': str(e)}), 500

@tracker_bp.route('/emails/category/<string:category>', methods=['GET'])
def get_emails_by_category(category):
    """Get emails filtered by a specific category"""
    try:
        valid_categories = ['candidate_submission', 'interview_scheduled', 'offer_recommendation', 'on_boarding', 'uncategorized']
        
        if category not in valid_categories:
            return jsonify({'error': f'Invalid category. Must be one of: {", ".join(valid_categories)}'}), 400
        
        # Initialize services
        email_processor = EmailProcessor()
        
        # Fetch all emails (no date limit)
        days = request.args.get('days', default=None, type=int)
        emails = email_processor.fetch_emails(days)
        
        # Filter for hiring emails
        hiring_emails = []
        for email in emails:
            if email_processor._is_hiring_email(email):
                hiring_emails.append(email)
        
        # Categorize and filter
        categorized_emails = {
            'candidate_submission': [],
            'interview_scheduled': [],
            'offer_recommendation': [],
            'on_boarding': [],
            'uncategorized': []
        }

        for email in hiring_emails:
            category = get_category_for_email(email)
            if category:
                categorized_emails[category].append(email)
            else:
                categorized_emails['uncategorized'].append(email)

        category_emails = categorized_emails.get(category, [])
        
        return jsonify({
            'category': category,
            'count': len(category_emails),
            'emails': category_emails
        })
        
    except Exception as e:
        current_app.logger.error(f"Error in get_emails_by_category: {str(e)}")
        return jsonify({'error': str(e)}), 500

@tracker_bp.route('/requirements/with-categories', methods=['GET'])
def get_requirements_with_categories():
    """Get all requirements with their automatically detected categories"""
    try:
        from app.models.email_details import EmailDetails
        requirements = get_db_session().query(Requirement).join(
            EmailDetails, Requirement.requirement_id == EmailDetails.requirement_id
        ).filter(
            Requirement.requirement_id.isnot(None),
            ~EmailDetails.email_subject.like('Re:%'),
            ~EmailDetails.email_subject.like('Fw:%'),
            ~EmailDetails.email_subject.like('Fwd:%'),
            ~EmailDetails.email_subject.like('Forward:%')
        ).order_by(
            EmailDetails.received_datetime.desc()
        ).all()
        
        result = []
        for req in requirements:
            # Get the category for this requirement
            category = get_category_for_requirement(req)
            
            req_data = {
                'id': req.requirement_id,
                'request_id': req.requirement_id,
                'job_title': req.job_title,
                'email_subject': req.email_details[0].email_subject if req.email_details else '',
                'sender_email': req.email_details[0].sender_email if req.email_details else '',
                'sender_name': req.email_details[0].sender_name if req.email_details else '',
                'company_name': format_enum_for_display(req.company_name),
                'received_datetime': req.email_details[0].received_datetime.isoformat() if req.email_details and req.email_details[0].received_datetime else None,
                'status': req.status.value if req.status else None,
                'assigned_to': _get_assigned_user_display(req.user_id),
                'notes': req.notes,
                'created_at': req.created_at.isoformat() if req.created_at else None,
                'updated_at': req.updated_at.isoformat() if req.updated_at else None,
                'thread_id': req.email_details[0].thread_id if req.email_details else None,
                'additional_remarks': req.additional_remarks,
                'detected_category': category or 'uncategorized'
            }
            result.append(req_data)
        
        # Group by category
        categorized = {
            'candidate_submission': [],
            'offer_recommendation': [],
            'on_boarding': [],
            'uncategorized': []
        }
        
        for req_data in result:
            category = req_data['detected_category']
            if category in categorized:
                categorized[category].append(req_data)
        
        return jsonify({
            'total': len(result),
            'categorized': categorized,
            'stats': {
                'candidate_submission': len(categorized['candidate_submission']),
                'offer_recommendation': len(categorized['offer_recommendation']),
                'on_boarding': len(categorized['on_boarding']),
                'uncategorized': len(categorized['uncategorized'])
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"Error in get_requirements_with_categories: {str(e)}")
        return jsonify({'error': str(e)}), 500 

@tracker_bp.route('/fix-candidate-submissions', methods=['POST'])
def fix_candidate_submissions():
    """Manually fix the status of requirements that have profiles but are still showing as 'Open'"""
    try:
        # Find all requirements that have profiles linked to them but are still marked as 'Open'
        requirements_to_fix = get_db_session().query(Requirement).join(
            Profile, Requirement.requirement_id == Profile.requirement_id
        ).filter(
            Requirement.status == 'Open'
        ).all()
        
        fixed_count = 0
        for req in requirements_to_fix:
            old_status = req.status
            req.status = 'Candidate_Submission'
            fixed_count += 1
            current_app.logger.info(f"Fixed requirement {req.requirement_id} status from '{old_status}' to 'Candidate_Submission'")
        
        get_db_session().commit()
        
        current_app.logger.info(f"Fixed {fixed_count} requirements to 'Candidate_Submission' status")
        return jsonify({
            'message': f'Fixed {fixed_count} requirements to Candidate_Submission status',
            'fixed_count': fixed_count
        })
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f"Error fixing candidate submissions: {str(e)}")
        return jsonify({'error': 'Failed to fix candidate submissions'}), 500 

@tracker_bp.route('/emails/<string:request_id>', methods=['GET'])
def get_emails_for_request(request_id):
    """Get all emails for a specific request_id"""
    try:
        # First, get the requirement to find the thread_id
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'error': 'Request ID not found'}), 404
        
        thread_id = requirement.thread_id
        if not thread_id:
            return jsonify({'error': 'No thread_id found for this request'}), 404
        
        # Initialize email processor
        email_processor = EmailProcessor()
        
        # Fetch all emails to ensure we get the thread
        all_emails = email_processor.fetch_emails(days=None)
        
        # Filter emails that belong to this thread
        thread_emails = []
        for email in all_emails:
            email_thread_id = email_processor._get_thread_id(email)
            if email_thread_id == thread_id:
                # Add request_id to the email data for reference
                email['request_id'] = request_id
                thread_emails.append(email)
        
        # Sort emails by received date (newest first)
        thread_emails.sort(key=lambda x: x.get('receivedDateTime', ''), reverse=True)
        
        return jsonify({
            'request_id': request_id,
            'thread_id': thread_id,
            'emails_count': len(thread_emails),
            'emails': thread_emails
        })
        
    except Exception as e:
        current_app.logger.error(f"Error fetching emails for request {request_id}: {str(e)}")
        return jsonify({'error': 'Failed to fetch emails'}), 500 

@tracker_bp.route('/profiles-count', methods=['GET'])
@cache_response(ttl=120, key_prefix='tracker_profiles_count')  # Cache for 2 minutes
def get_profiles_count():
    """Get profile counts for all tracker requirements - OPTIMIZED + CACHED"""
    try:
        # Get user from request headers for role-based filtering
        auth_header = request.headers.get('Authorization')
        current_user = None
        
        if auth_header:
            try:
                parts = auth_header.split(' ')
                if len(parts) == 2 and parts[0] == 'Bearer':
                    username = parts[1].strip()  # Trim whitespace from username
                    from app.models.user import User
                    # Try exact match first, then try with trailing space (for backward compatibility)
                    current_user = get_db_session().query(User).filter_by(username=username).first()
                    if not current_user:
                        # Try with trailing space (for data inconsistency)
                        current_user = get_db_session().query(User).filter_by(username=f"{username} ").first()
                    if not current_user:
                        # Try without trailing space if username has one
                        if username.endswith(' '):
                            current_user = get_db_session().query(User).filter_by(username=username.rstrip()).first()
            except Exception as e:
                current_app.logger.warning(f"Error parsing auth header: {str(e)}")
        
        # Get manual requirements (these should always be included regardless of email subject)
        # Exclude project requirements from main tracker
        manual_query = get_db_session().query(Requirement).filter(
            Requirement.requirement_id.isnot(None),
            Requirement.is_manual_requirement == True,
            
        )
        
        # Get automatic requirements (email-based) with existing filters
        from app.models.email_details import EmailDetails
        automatic_query = get_db_session().query(Requirement).join(
            EmailDetails, Requirement.requirement_id == EmailDetails.requirement_id
        ).filter(
            Requirement.requirement_id.isnot(None),
            Requirement.is_manual_requirement == False,
            ~EmailDetails.email_subject.like('Re:%'),
            ~EmailDetails.email_subject.like('Fw:%'),
            ~EmailDetails.email_subject.like('Fwd:%'),
            ~EmailDetails.email_subject.like('Forward:%')
        )
        
        # Apply role-based filtering to both manual and automatic queries
        if current_user and current_user.role.value == 'recruiter':
            # For recruiters, only show requirements assigned to them AND not on hold
            manual_query = manual_query.filter(
                Requirement.user_id == current_user.user_id,
                Requirement.status != 'On_Hold'
            )
            automatic_query = automatic_query.filter(
                Requirement.user_id == current_user.user_id,
                Requirement.status != 'On_Hold'
            )
            current_app.logger.info(f"Filtering requirements for recruiter: {current_user.username} (excluding on-hold requirements)")
        elif current_user and current_user.role == 'admin':
            # For admins, show all requirements including on-hold ones
            current_app.logger.info(f"Showing all requirements for admin: {current_user.username}")
        else:
            # For unauthenticated users or unknown roles, show all (or you can restrict this)
            current_app.logger.info("No user authentication found, showing all requirements")
        
        # Execute both queries and combine results
        manual_requirements = manual_query.order_by(Requirement.created_at.desc()).all()
        automatic_requirements = automatic_query.order_by(EmailDetails.received_datetime.desc()).all()
        
        # Combine both sets
        requirements = manual_requirements + automatic_requirements
        
        current_app.logger.info(f"Profiles-count endpoint: Found {len(manual_requirements)} manual requirements and {len(automatic_requirements)} automatic requirements")
        for req in manual_requirements:
            current_app.logger.info(f"Manual requirement in profiles-count: {req.requirement_id} - {req.job_title} (assigned_to: {req.user_id})")
        for req in automatic_requirements:
            current_app.logger.info(f"Automatic requirement in profiles-count: {req.requirement_id} - {req.job_title} (assigned_to: {req.user_id})")
        
        # OPTIMIZATION: Batch fetch all related data to avoid N+1 queries
        requirement_ids = [req.requirement_id for req in requirements]
        
        if requirement_ids:
            # OPTIMIZATION 1: Batch fetch profile counts using a single query with aggregation
            from sqlalchemy import func, case
            from app.models.profile import ProfileStatusEnum
            
            profile_counts_query = get_db_session().query(
                Profile.requirement_id,
                func.count(Profile.profile_id).label('total_count'),
                func.sum(
                    case(
                        (Profile.status == ProfileStatusEnum.onboarded, 1),
                        else_=0
                    )
                ).label('onboarded_count')
            ).filter(
                Profile.requirement_id.in_(requirement_ids),
                Profile.deleted_at.is_(None)
            ).group_by(Profile.requirement_id).all()
            
            # Create lookup dictionaries for O(1) access
            profile_counts_map = {
                str(row.requirement_id): {
                    'total': row.total_count or 0,
                    'onboarded': row.onboarded_count or 0
                }
                for row in profile_counts_query
            }
            
            # OPTIMIZATION 2: Batch fetch assigned recruiters using a single query
            from app.models.assignment import Assignment
            assignments_query = get_db_session().query(
                Assignment.requirement_id,
                User.username,
                User.role
            ).join(
                User, Assignment.user_id == User.user_id
            ).filter(
                Assignment.requirement_id.in_(requirement_ids),
                Assignment.is_active == True,
                User.role == 'recruiter'
            ).all()
            
            # Create lookup dictionary for assigned recruiters
            assigned_recruiters_map = {}
            for row in assignments_query:
                req_id_str = str(row.requirement_id)
                if req_id_str not in assigned_recruiters_map:
                    assigned_recruiters_map[req_id_str] = []
                assigned_recruiters_map[req_id_str].append(row.username)
            
            # OPTIMIZATION 3: Batch fetch breach times using a single query
            from app.models.sla_tracker import SLATracker, SLAStatusEnum
            from sqlalchemy.sql import func as sqlfunc
            
            # Subquery to get the max breach hours for each requirement
            max_breach_subquery = get_db_session().query(
                SLATracker.requirement_id,
                sqlfunc.max(SLATracker.sla_breach_hours).label('max_breach_hours')
            ).filter(
                SLATracker.requirement_id.in_(requirement_ids),
                SLATracker.sla_status == SLAStatusEnum.breached
            ).group_by(SLATracker.requirement_id).subquery()
            
            # Get the actual breach records
            breach_query = get_db_session().query(
                SLATracker.requirement_id,
                SLATracker.sla_breach_hours
            ).join(
                max_breach_subquery,
                (SLATracker.requirement_id == max_breach_subquery.c.requirement_id) &
                (SLATracker.sla_breach_hours == max_breach_subquery.c.max_breach_hours)
            ).filter(
                SLATracker.sla_status == SLAStatusEnum.breached
            ).all()
            
            # Create lookup dictionary for breach times
            breach_times_map = {}
            for row in breach_query:
                req_id_str = str(row.requirement_id)
                if row.sla_breach_hours:
                    breach_hours = row.sla_breach_hours
                    breach_days = breach_hours / 24
                    breach_days_rounded = round(breach_days, 1)
                    
                    # Format breach time as "X days" or "X hours" if less than 1 day
                    if breach_days_rounded >= 1:
                        breach_times_map[req_id_str] = f"{int(breach_days_rounded)} days"
                    else:
                        breach_times_map[req_id_str] = f"{int(breach_hours)} hours"
        else:
            profile_counts_map = {}
            assigned_recruiters_map = {}
            breach_times_map = {}
        
        # Build result using pre-fetched data (no more N+1 queries!)
        result = []
        for req in requirements:
            req_id_str = str(req.requirement_id)
            
            # Get profile counts from pre-fetched data
            counts = profile_counts_map.get(req_id_str, {'total': 0, 'onboarded': 0})
            profile_count = counts['total']
            onboarded_count = counts['onboarded']
            
            # Get breach time from pre-fetched data
            breach_time_display = breach_times_map.get(req_id_str, None)
            
            req_dict = req.to_dict()
            req_dict['profiles_count'] = profile_count
            req_dict['onboarded_count'] = onboarded_count
            req_dict['selected_profiles_count'] = onboarded_count  # Add selected_profiles_count for consistency
            req_dict['breach_time_display'] = breach_time_display
            
            # Add assignment information from pre-fetched data
            req_dict['assigned_to'] = _get_assigned_user_display(req.user_id)
            req_dict['assigned_recruiters'] = assigned_recruiters_map.get(req_id_str, [])
            
            # Check if this is a new assignment (updated within 24 hours and current user is assigned)
            is_new_assignment = False
            if current_user and current_user.role.value == 'recruiter' and req.updated_at:
                time_diff = datetime.utcnow() - req.updated_at
                is_within_24_hours = time_diff.total_seconds() < 24 * 60 * 60  # 24 hours in seconds
                # Check if current user is assigned to this requirement
                is_assigned_to_user = (req.user_id == current_user.user_id) if current_user else False
                is_new_assignment = is_within_24_hours and is_assigned_to_user
            req_dict['is_new_assignment'] = is_new_assignment
            
            result.append(req_dict)
        
        # Sort result by priority (Urgent > High > Medium > Low > None)
        priority_order = {'Urgent': 1, 'High': 2, 'Medium': 3, 'Low': 4}
        
        def get_priority_sort_key(item):
            priority = item.get('priority')
            if priority is None or priority == '':
                return 5  # None/empty priorities go last
            return priority_order.get(priority, 5)  # Unknown priorities go last
        
        result.sort(key=get_priority_sort_key)
        
        return jsonify({'requirements': result})
    except Exception as e:
        current_app.logger.error(f"Error fetching requirements with profile counts: {str(e)}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Failed to fetch requirements with profile counts'}), 500

@tracker_bp.route('/onboarding-status', methods=['POST'])
def update_onboarding_status():
    """Update onboarding status for profiles"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'message': 'No data provided'}), 400
        
        request_id = data.get('request_id')
        onboarded_student_ids = data.get('onboarded_student_ids', [])
        
        if not request_id:
            return jsonify({'success': False, 'message': 'No request_id provided'}), 400
        
        # Get the requirement
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'success': False, 'message': 'Requirement not found'}), 404
        
        # Get all profiles linked to this requirement
        profiles = get_db_session().query(Profile).filter(
            Profile.requirement_id == requirement.requirement_id,
            Profile.deleted_at.is_(None)
        ).all()
        
        if not profiles:
            return jsonify({'success': False, 'message': 'No profiles found for this requirement'}), 404
        
        # Update onboarding status for each profile
        # Note: This would need to be updated to use the Onboarding model
        # For now, we'll just log the request
        updated_count = 0
        for profile in profiles:
            is_onboarded = profile.student_id in onboarded_student_ids
            # TODO: Update onboarding status in the Onboarding model
            # This requires implementing the onboarding status update logic
            updated_count += 1
        
        get_db_session().commit()
        
        current_app.logger.info(f"Updated onboarding status for {updated_count} profiles")
        return jsonify({'success': True, 'message': f'Onboarding status updated for {updated_count} profiles'})
    except Exception as e:
        current_app.logger.error(f"Error updating onboarding status: {str(e)}")
        get_db_session().rollback()
        return jsonify({'success': False, 'message': 'Failed to update onboarding status'}), 500

@tracker_bp.route('/<string:request_id>/close', methods=['POST'])
def close_requirement(request_id):
    """Close a requirement and set closed_at timestamp"""
    try:
        # Get the requirement
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'success': False, 'message': 'Requirement not found'}), 404
        
        # Close the requirement
        requirement.close_requirement()
        get_db_session().commit()
        
        current_app.logger.info(f"Closed requirement {request_id}")
        return jsonify({'success': True, 'message': 'Requirement closed successfully'})
    except Exception as e:
        current_app.logger.error(f"Error closing requirement {request_id}: {str(e)}")
        get_db_session().rollback()
        return jsonify({'success': False, 'message': 'Failed to close requirement'}), 500

@tracker_bp.route('/closed', methods=['GET'])
@cache_response(ttl=600)  # Cache for 10 minutes
def get_closed_requirements():
    """Get all closed requirements with metrics"""
    try:
        from app.models.user import User
        from app.models.assignment import Assignment
        
        # Get all closed requirements
        closed_requirements = get_db_session().query(Requirement).filter_by(status='Closed').all()
        
        closed_data = []
        for requirement in closed_requirements:
            # Get profiles linked to this requirement
            profiles = get_db_session().query(Profile).filter(
                Profile.requirement_id == requirement.requirement_id,
                Profile.deleted_at.is_(None)
            ).all()
            
            # Calculate metrics
            profiles_count = len(profiles)
            # Calculate selected profiles count from profile status
            selected_profiles_count = len([p for p in profiles if p.status and p.status.value == 'onboarded'])
            
            # Build assigned recruiters list (active assignments) and legacy primary name
            assigned_recruiters = []
            try:
                active_assignments = get_db_session().query(Assignment).filter_by(
                    requirement_id=requirement.requirement_id,
                    is_active=True
                ).all()
                for a in active_assignments:
                    # Prefer username; fallback to full_name
                    if a.user:
                        name = getattr(a.user, 'username', None) or getattr(a.user, 'full_name', None)
                        if name:
                            assigned_recruiters.append(name)
            except Exception:
                pass

            # Legacy single recruiter (owner)
            recruiter_name = None
            if requirement.user_id:
                recruiter = get_db_session().query(User).filter_by(user_id=requirement.user_id).first()
                if recruiter:
                    recruiter_name = getattr(recruiter, 'full_name', None) or getattr(recruiter, 'username', None)
            
            closed_data.append({
                'request_id': requirement.request_id,  # Use request_id instead of requirement_id for proper format
                'job_title': requirement.job_title,
                'company_name': format_enum_for_display(requirement.company_name),
                'overall_time': requirement.get_overall_time(),
                'recruiter_name': recruiter_name,  # legacy for backward compatibility
                'assigned_recruiters': assigned_recruiters,
                'profiles_count': profiles_count,
                'selected_profiles_count': selected_profiles_count,
                'closed_at': requirement.closed_at.isoformat() if requirement.closed_at else None,
                'created_at': requirement.created_at.isoformat() if requirement.created_at else None
            })
        
        return jsonify(closed_data)
    except Exception as e:
        current_app.logger.error(f"Error fetching closed requirements: {str(e)}")
        return jsonify({'error': 'Failed to fetch closed requirements'}), 500

@tracker_bp.route('/profiles', methods=['POST'])
def create_profiles():
    """Create multiple profiles for a specific request_id"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'message': 'No data provided'}), 400
        
        profiles_data = data.get('profiles', [])
        request_id = data.get('request_id')
        
        if not profiles_data:
            return jsonify({'success': False, 'message': 'No profiles data provided'}), 400
        
        if not request_id:
            return jsonify({'success': False, 'message': 'No request_id provided'}), 400
        
        # Check if requirement exists
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'success': False, 'message': 'Requirement not found'}), 404
        
        created_profiles = []
        student_ids = []
        skipped_duplicates = 0
        
        def generate_unique_student_id():
            """Generate a unique student ID with retry logic"""
            max_retries = 10
            for attempt in range(max_retries):
                try:
                    # Get the highest existing student_id and increment
                    last_profile = get_db_session().query(Profile).order_by(Profile.student_id.desc()).first()
                    if last_profile and last_profile.student_id.startswith('STU'):
                        try:
                            last_number = int(last_profile.student_id[3:])
                            next_number = last_number + 1 + attempt  # Add attempt to avoid conflicts
                        except ValueError:
                            next_number = 1 + attempt
                    else:
                        next_number = 1 + attempt
                    
                    student_id = f"STU{next_number:03d}"
                    
                    # Check if this ID already exists
                    existing = get_db_session().query(Profile).filter_by(student_id=student_id).first()
                    if not existing:
                        return student_id
                        
                except Exception as e:
                    current_app.logger.warning(f"Error generating student ID (attempt {attempt + 1}): {str(e)}")
                    continue
            
            # If all attempts failed, use timestamp-based ID
            import time
            timestamp = int(time.time() * 1000) % 1000000
            return f"STU{timestamp:06d}"
        
        def is_duplicate_profile(profile_data):
            """Check if profile is duplicate across the entire database"""
            contact_no = profile_data.get('contact_no', '').strip()
            email_id = profile_data.get('email_id', '').strip()
            candidate_name = profile_data.get('candidate_name', '').strip()
            
            # Check for duplicates across the entire database by email OR contact
            if email_id and '@' in str(email_id):
                # Check by email
                existing_profile = get_db_session().query(Profile).filter(Profile.email_id == email_id).first()
                if existing_profile:
                    current_app.logger.info(f"Duplicate profile found by email match: {candidate_name} (Email: {email_id})")
                    return True
            
            # If no email match found, check by contact
            if contact_no:
                existing_profile = get_db_session().query(Profile).filter(Profile.contact_no == contact_no).first()
                if existing_profile:
                    current_app.logger.info(f"Duplicate profile found by contact match: {candidate_name} (Contact: {contact_no})")
                    return True
            
            return False
        
        for profile_data in profiles_data:
            try:
                current_app.logger.info(f"Processing profile: {profile_data.get('candidate_name', 'Unknown')} (Email: {profile_data.get('email_id', 'None')}, Contact: {profile_data.get('contact_no', 'None')})")
                
                # Check for duplicate profile
                if is_duplicate_profile(profile_data):
                    skipped_duplicates += 1
                    current_app.logger.info(f"Skipping duplicate profile: {profile_data.get('candidate_name', 'Unknown')}")
                    continue
                
                # Generate unique student_id with retry logic
                student_id = generate_unique_student_id()
                
                # Get current user for recruiter attribution
                current_user = None
                auth_header = request.headers.get('Authorization')
                if auth_header:
                    try:
                        parts = auth_header.split(' ')
                        if len(parts) == 2 and parts[0] == 'Bearer':
                            username = parts[1].strip()  # Strip whitespace
                            current_user = get_db_session().query(User).filter_by(username=username).first()
                    except Exception as e:
                        current_app.logger.warning(f"Error getting current user: {str(e)}")
                
                # Create new profile
                profile = Profile(
                    student_id=student_id,
                    requirement_id=requirement.requirement_id,  # Set requirement_id during creation
                    candidate_name=profile_data.get('candidate_name', ''),
                    email_id=profile_data.get('email_id', ''),
                    contact_no=profile_data.get('contact_no', ''),
                    total_experience=profile_data.get('total_experience', 0),
                    relevant_experience=profile_data.get('relevant_experience', 0),
                    current_company=profile_data.get('current_company', ''),
                    location=profile_data.get('location', ''),
                    notice_period_days=profile_data.get('notice_period_days', 0),
                    ctc_current=profile_data.get('ctc_current', 0),
                    ctc_expected=profile_data.get('ctc_expected', 0),
                    key_skills=profile_data.get('key_skills', ''),
                    education=profile_data.get('education', ''),  # Add education field
                    source=None,  # Will be set after profile creation
                    created_by_recruiter=current_user.user_id if current_user else None,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                
                # Handle source enum conversion
                source_value = profile_data.get('source', '').strip()
                if source_value:
                    try:
                        from app.models.profile import SourceEnum
                        # Convert string to enum by value
                        for enum_member in SourceEnum:
                            if enum_member.value == source_value:
                                profile.source = enum_member
                                break
                        else:
                            # If no match found, log warning and set to None
                            current_app.logger.warning(f"Invalid source value '{source_value}'. Valid options: {[e.value for e in SourceEnum]}")
                            profile.source = None
                    except Exception as e:
                        current_app.logger.warning(f"Error processing source value '{source_value}': {str(e)}")
                        profile.source = None
                
                # Add to session but don't commit yet
                get_db_session().add(profile)
                created_profiles.append(profile)
                student_ids.append(student_id)
                

                
            except Exception as e:
                current_app.logger.error(f"Error creating profile: {str(e)}")
                continue
        
        # Update profiles to link them to the requirement
        for student_id in student_ids:
            # Get the profile UUID for this student_id
            profile = get_db_session().query(Profile).filter(
                Profile.student_id == student_id,
                Profile.deleted_at.is_(None)
            ).first()
            if not profile:
                current_app.logger.error(f"Profile not found for student_id: {student_id}")
                continue

            # Get the requirement UUID for this request_id
            requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
            if not requirement:
                current_app.logger.error(f"Requirement not found for request_id: {request_id}")
                continue

            # Link the profile to the requirement
            profile.requirement_id = requirement.requirement_id
            profile.updated_at = datetime.utcnow()
        
        # Update requirement status to Candidate_Submission if it's still Open
        try:
            from app.models.requirement import RequirementStatusEnum
            if requirement.status == RequirementStatusEnum.Open:
                requirement.status = RequirementStatusEnum.Candidate_Submission
                requirement.updated_at = datetime.utcnow()
        except Exception as e:
            current_app.logger.warning(f"Could not set requirement status to Candidate_Submission on profile creation: {str(e)}")
        
        # Commit all changes at once
        get_db_session().commit()
        
        current_app.logger.info(f"Created {len(created_profiles)} profiles for request {request_id}, skipped {skipped_duplicates} duplicates")
        current_app.logger.info(f"Response will be: success={len(created_profiles) > 0}, has_duplicates={skipped_duplicates > 0}, all_duplicates={skipped_duplicates > 0 and len(created_profiles) == 0}")
        
        # Determine response based on what happened
        if skipped_duplicates > 0 and len(created_profiles) == 0:
            # All profiles were duplicates
            return jsonify({
                'success': False,
                'message': f'Duplicate Profile Added. Saved Profile already exists.',
                'profiles_created': 0,
                'duplicates_skipped': skipped_duplicates,
                'request_id': request_id,
                'has_duplicates': True,
                'all_duplicates': True
            }), 400
        elif skipped_duplicates > 0 and len(created_profiles) > 0:
            # Some profiles were created, some were duplicates
            return jsonify({
                'success': True,
                'message': f'Successfully created {len(created_profiles)} profiles, but {skipped_duplicates} duplicate(s) were skipped.',
                'profiles_created': len(created_profiles),
                'duplicates_skipped': skipped_duplicates,
                'request_id': request_id,
                'has_duplicates': True,
                'all_duplicates': False,
                'created_profiles': [profile.to_dict() for profile in created_profiles]
            })
        else:
            # All profiles were created successfully
            return jsonify({
                'success': True,
                'message': f'Successfully created {len(created_profiles)} profiles',
                'profiles_created': len(created_profiles),
                'duplicates_skipped': 0,
                'request_id': request_id,
                'has_duplicates': False,
                'all_duplicates': False,
                'created_profiles': [profile.to_dict() for profile in created_profiles]
            })
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f"Error creating profiles: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to create profiles: {str(e)}'}), 500

@tracker_bp.route('/profiles/move', methods=['POST'])
def move_profile():
    """
    Move a profile from one requirement to another (Simple Movement)
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        # Extract required fields
        profile_id = data.get('profile_id')
        from_request_id = data.get('from_request_id')
        to_request_id = data.get('to_request_id')
        reason = data.get('reason', '')
        
        # Validate required fields
        if not profile_id:
            return jsonify({'success': False, 'error': 'profile_id is required'}), 400
        if not from_request_id:
            return jsonify({'success': False, 'error': 'from_request_id is required'}), 400
        if not to_request_id:
            return jsonify({'success': False, 'error': 'to_request_id is required'}), 400
        
        # Get current user for permission checking and audit trail
        auth_header = request.headers.get('Authorization')
        current_user = None
        moved_by_user = 'system'
        
        if auth_header:
            try:
                parts = auth_header.split(' ')
                if len(parts) == 2 and parts[0] == 'Bearer':
                    username = parts[1].strip()
                    from app.models.user import User
                    current_user = get_db_session().query(User).filter_by(username=username).first()
                    if not current_user:
                        current_user = get_db_session().query(User).filter_by(username=f"{username} ").first()
                    if not current_user:
                        if username.endswith(' '):
                            current_user = get_db_session().query(User).filter_by(username=username.rstrip()).first()
                    
                    if current_user:
                        moved_by_user = current_user.username
            except Exception as e:
                current_app.logger.warning(f"Error parsing auth header: {str(e)}")
        
        # Check permissions
        if current_user and current_user.role.value == 'recruiter':
            # For recruiters, check if they have access to both requirements
            from_requirement = get_db_session().query(Requirement).filter_by(request_id=from_request_id).first()
            to_requirement = get_db_session().query(Requirement).filter_by(request_id=to_request_id).first()
            
            if not from_requirement or not to_requirement:
                return jsonify({'success': False, 'error': 'One or both requirements not found'}), 404
            
            # Check if recruiter is assigned to both requirements
            from_assigned = from_requirement.is_assigned_to(current_user.username, session=get_db_session())
            to_assigned = to_requirement.is_assigned_to(current_user.username, session=get_db_session())
            
            if not from_assigned and not to_assigned:
                return jsonify({'success': False, 'error': 'You do not have permission to move profiles between these requirements'}), 403
        
        # Note: The TrackerService is deprecated as it uses legacy models
        # For now, we'll implement a simple profile movement logic
        # TODO: Implement proper profile movement using the new schema
        
        # Get the profile
        profile = get_db_session().query(Profile).filter(
            Profile.profile_id == profile_id,
            Profile.deleted_at.is_(None)
        ).first()
        
        if not profile:
            return jsonify({
                'success': False,
                'error': 'Profile not found',
                'error_code': 'PROFILE_NOT_FOUND'
            }), 404
        
        # Get the target requirement
        target_requirement = get_db_session().query(Requirement).filter_by(request_id=to_request_id).first()
        if not target_requirement:
            return jsonify({
                'success': False,
                'error': 'Target requirement not found',
                'error_code': 'TARGET_REQUIREMENT_NOT_FOUND'
            }), 404
        
        # Move the profile to the new requirement
        profile.requirement_id = target_requirement.requirement_id
        profile.updated_at = datetime.utcnow()
        
        get_db_session().commit()
        
        result = {
            'success': True,
            'message': f'Profile {profile.candidate_name} moved successfully',
            'data': {
                'profile_id': profile_id,
                'from_request_id': from_request_id,
                'to_request_id': to_request_id,
                'moved_by': moved_by_user
            }
        }
        
        if result['success']:
            # Add reason to the response if provided
            if reason:
                result['data']['reason'] = reason
            
            return jsonify(result), 200
        else:
            # Return appropriate HTTP status based on error code
            error_code = result.get('error_code', 'MOVEMENT_ERROR')
            if error_code in ['SOURCE_REQUIREMENT_NOT_FOUND', 'TARGET_REQUIREMENT_NOT_FOUND', 'PROFILE_NOT_FOUND']:
                return jsonify(result), 404
            elif error_code in ['SOURCE_REQUIREMENT_CLOSED', 'TARGET_REQUIREMENT_CLOSED']:
                return jsonify(result), 422
            elif error_code in ['PROFILE_ALREADY_IN_TARGET', 'SAME_REQUIREMENT']:
                return jsonify(result), 409
            else:
                return jsonify(result), 400
        
    except Exception as e:
        current_app.logger.error(f"Error in move_profile endpoint: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Internal server error: {str(e)}',
            'error_code': 'INTERNAL_ERROR'
        }), 500

@tracker_bp.route('/profiles/<profile_id>/can-move-to/<request_id>', methods=['GET'])
def can_move_profile(profile_id, request_id):
    """
    Check if a profile can be moved to a specific requirement
    """
    try:
        # Get current user for permission checking
        auth_header = request.headers.get('Authorization')
        current_user = None
        
        if auth_header:
            try:
                parts = auth_header.split(' ')
                if len(parts) == 2 and parts[0] == 'Bearer':
                    username = parts[1].strip()
                    from app.models.user import User
                    current_user = get_db_session().query(User).filter_by(username=username).first()
                    if not current_user:
                        current_user = get_db_session().query(User).filter_by(username=f"{username} ").first()
                    if not current_user:
                        if username.endswith(' '):
                            current_user = get_db_session().query(User).filter_by(username=username.rstrip()).first()
            except Exception as e:
                current_app.logger.warning(f"Error parsing auth header: {str(e)}")
        
        # Get the profile to find its current requirement
        profile = get_db_session().query(Profile).filter(
            Profile.profile_id == profile_id,
            Profile.deleted_at.is_(None)
        ).first()
        
        if not profile:
            return jsonify({
                'can_move': False,
                'error': 'Profile not found',
                'error_code': 'PROFILE_NOT_FOUND'
            }), 404
        
        # Find current requirement
        if not profile.requirement_id:
            return jsonify({
                'can_move': False,
                'error': 'Profile is not associated with any requirement',
                'error_code': 'PROFILE_NOT_ASSOCIATED'
            }), 404
        
        current_requirement = get_db_session().query(Requirement).filter_by(requirement_id=profile.requirement_id).first()
        if not current_requirement:
            return jsonify({
                'can_move': False,
                'error': 'Current requirement not found',
                'error_code': 'CURRENT_REQUIREMENT_NOT_FOUND'
            }), 404
        
        from_request_id = current_requirement.requirement_id
        
        # Simple validation - check if target requirement exists and is not closed
        target_requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not target_requirement:
            return jsonify({
                'can_move': False,
                'error': 'Target requirement not found',
                'error_code': 'TARGET_REQUIREMENT_NOT_FOUND'
            }), 404
        
        from app.models.requirement import RequirementStatusEnum
        if target_requirement.status == RequirementStatusEnum.Closed:
            return jsonify({
                'can_move': False,
                'error': 'Cannot move profile to a closed requirement',
                'error_code': 'TARGET_REQUIREMENT_CLOSED'
            }), 422
        
        validation_result = {'valid': True}
        
        if validation_result['valid']:
            # Check permissions if user is a recruiter
            if current_user and current_user.role.value == 'recruiter':
                target_requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
                if target_requirement:
                    from_assigned = current_requirement.is_assigned_to(current_user.username, session=get_db_session())
                    to_assigned = target_requirement.is_assigned_to(current_user.username, session=get_db_session())
                    
                    if not from_assigned and not to_assigned:
                        return jsonify({
                            'can_move': False,
                            'error': 'You do not have permission to move profiles to this requirement',
                            'error_code': 'PERMISSION_DENIED'
                        }), 403
            
            return jsonify({
                'can_move': True,
                'profile_name': profile.candidate_name,
                'student_id': profile.student_id,
                'from_request_id': from_request_id,
                'to_request_id': request_id,
                'message': f'Profile {profile.candidate_name} can be moved from {from_request_id} to {request_id}'
            })
        else:
            return jsonify({
                'can_move': False,
                'error': validation_result['error'],
                'error_code': validation_result['error_code']
            }), 400
        
    except Exception as e:
        current_app.logger.error(f"Error in can_move_profile endpoint: {str(e)}")
        return jsonify({
            'can_move': False,
            'error': f'Internal server error: {str(e)}',
            'error_code': 'INTERNAL_ERROR'
        }), 500 
