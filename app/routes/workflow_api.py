from flask import Blueprint, jsonify, request, current_app, g
from app.models.requirement import Requirement, RequirementStatusEnum, format_enum_for_display
from app.models.profile import Profile
from app.models.screening import Screening, ScreeningStatusEnum
from app.models.interview_scheduled import InterviewScheduled, InterviewScheduledStatusEnum
from app.models.interview_round_one import InterviewRoundOne, InterviewRoundOneStatusEnum
from app.models.interview_round_two import InterviewRoundTwo, InterviewRoundTwoStatusEnum
from app.models.offer import Offer
from app.models.onboarding import Onboarding, OnboardingStatusEnum
from app.models.meeting import Meeting
from app.models.user import User
from app.database import db
from datetime import datetime
import logging
from app.middleware.domain_auth import require_domain_auth

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

workflow_bp = Blueprint('workflow', __name__, url_prefix='/api')

@workflow_bp.route('/workflow-progress/<request_id>', methods=['GET'])
@require_domain_auth
def get_workflow_progress(request_id):
    """Get workflow progress for a specific request"""
    try:
        # Validate request_id exists
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({
                'success': False,
                'error': 'Request not found',
                'message': f'No requirement found with request_id: {request_id}'
            }), 404
        
        # Get profiles linked to this requirement
        profiles = get_db_session().query(Profile).filter(
            Profile.requirement_id == requirement.requirement_id,
            Profile.deleted_at.is_(None)
        ).all()
        
        # Get workflow data from the new models
        screening_records = get_db_session().query(Screening).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        interview_scheduled_records = get_db_session().query(InterviewScheduled).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        interview_round_one_records = get_db_session().query(InterviewRoundOne).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        interview_round_two_records = get_db_session().query(InterviewRoundTwo).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        offer_records = get_db_session().query(Offer).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        onboarding_records = get_db_session().query(Onboarding).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        # Also check profile status for backward compatibility
        onboarded_profiles = [p for p in profiles if p.status and p.status.value == 'onboarded']

        # Map profile_id -> student_id for frontend consistency
        profile_id_to_student = {str(p.profile_id): p.student_id for p in profiles}
        
        # Build workflow data structure
        workflow_data = {
            'request_id': request_id,
            'screening_selected': [profile_id_to_student.get(str(r.profile_id)) for r in screening_records if r.status == ScreeningStatusEnum.selected and profile_id_to_student.get(str(r.profile_id))],
            'screening_rejected': [profile_id_to_student.get(str(r.profile_id)) for r in screening_records if r.status == ScreeningStatusEnum.rejected and profile_id_to_student.get(str(r.profile_id))],
            'interview_scheduled': [profile_id_to_student.get(str(r.profile_id)) for r in interview_scheduled_records if r.status == InterviewScheduledStatusEnum.scheduled and profile_id_to_student.get(str(r.profile_id))],
            'interview_rescheduled': [profile_id_to_student.get(str(r.profile_id)) for r in interview_scheduled_records if r.status == InterviewScheduledStatusEnum.rescheduled and profile_id_to_student.get(str(r.profile_id))],
            'round1_selected': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_one_records if r.status == InterviewRoundOneStatusEnum.select and profile_id_to_student.get(str(r.profile_id))],
            'round1_rejected': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_one_records if r.status == InterviewRoundOneStatusEnum.reject and profile_id_to_student.get(str(r.profile_id))],
            'round1_rescheduled': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_one_records if r.status == InterviewRoundOneStatusEnum.reschedule and profile_id_to_student.get(str(r.profile_id))],
            'round2_selected': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_two_records if r.status == InterviewRoundTwoStatusEnum.select and profile_id_to_student.get(str(r.profile_id))],
            'round2_rejected': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_two_records if r.status == InterviewRoundTwoStatusEnum.reject and profile_id_to_student.get(str(r.profile_id))],
            'round2_rescheduled': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_two_records if r.status == InterviewRoundTwoStatusEnum.reschedule and profile_id_to_student.get(str(r.profile_id))],
            'offered': [profile_id_to_student.get(str(r.profile_id)) for r in offer_records if r.active and profile_id_to_student.get(str(r.profile_id))],
            'onboarding': [profile_id_to_student.get(str(r.profile_id)) for r in onboarding_records if r.status == OnboardingStatusEnum.onboarded and profile_id_to_student.get(str(r.profile_id))] + [p.student_id for p in onboarded_profiles],
            'current_step': 'candidate_submission',
            'newly_added_profiles': [],
            'session_start_time': int(datetime.utcnow().timestamp() * 1000),
            'created_at': requirement.created_at.isoformat() if requirement.created_at else None,
            'updated_at': requirement.updated_at.isoformat() if requirement.updated_at else None,
            'blocked_profiles': {
                'screening': [],
                'interview_scheduled': [],
                'interview_round_1': [],
                'interview_round_2': [],
                'offered': [],
                'onboarding': []
            },
            'step_timestamps': {}
        }
        
        # Add step timestamps for each profile
        profile_timestamps = {}
        for profile in profiles:
            profile_id = str(profile.profile_id)
            profile_timestamps[profile_id] = {}
            
            # Get timestamps from each step table
            screening_record = next((r for r in screening_records if str(r.profile_id) == profile_id), None)
            if screening_record:
                profile_timestamps[profile_id]['screening'] = screening_record.status_timestamp.isoformat()
            
            interview_scheduled_record = next((r for r in interview_scheduled_records if str(r.profile_id) == profile_id), None)
            if interview_scheduled_record:
                profile_timestamps[profile_id]['interview_scheduled'] = interview_scheduled_record.status_timestamp.isoformat()
            
            round1_record = next((r for r in interview_round_one_records if str(r.profile_id) == profile_id), None)
            if round1_record:
                profile_timestamps[profile_id]['interview_round_1'] = round1_record.status_timestamp.isoformat()
            
            round2_record = next((r for r in interview_round_two_records if str(r.profile_id) == profile_id), None)
            if round2_record:
                profile_timestamps[profile_id]['interview_round_2'] = round2_record.status_timestamp.isoformat()
            
            offer_record = next((r for r in offer_records if str(r.profile_id) == profile_id), None)
            if offer_record:
                profile_timestamps[profile_id]['offered'] = offer_record.created_at.isoformat()
            
            # For onboarding, we'll use the profile's updated_at if it has onboarded status
            if profile.status and profile.status.value == 'onboarded':
                profile_timestamps[profile_id]['onboarding'] = profile.updated_at.isoformat()
        
        workflow_data['step_timestamps'] = profile_timestamps
        
        # Determine current step based on requirement status (use enum values)
        if requirement.status:
            status_to_step = {
                'Open': 'candidate_submission',
                'Candidate_Submission': 'candidate_submission',
                'Interview_Scheduled': 'interview_scheduled',
                'Offer_Recommendation': 'offered',
                'On_Boarding': 'onboarding',
                'Closed': 'onboarding'
            }
            workflow_data['current_step'] = status_to_step.get(getattr(requirement.status, 'value', str(requirement.status)), 'candidate_submission')
            # Add display-friendly status for frontend (no underscores)
            workflow_data['requirement_status'] = getattr(requirement.status, 'value', str(requirement.status))
            workflow_data['requirement_status_display'] = format_enum_for_display(workflow_data['requirement_status'])
        
        return jsonify({
            'success': True,
            'data': workflow_data
        })
        
    except Exception as e:
        current_app.logger.error(f'Error getting workflow progress for {request_id}: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'Failed to retrieve workflow progress'
        }), 500

@workflow_bp.route('/workflow-step', methods=['POST'])
@require_domain_auth
def update_workflow_step():
    """Update workflow step for profiles"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Invalid request data',
                'message': 'No data provided'
            }), 400
        
        request_id = data.get('request_id')
        step = data.get('step')
        profile_ids = data.get('profile_ids', [])
        status = data.get('status')
        user_id = data.get('user_id')
        
        if not all([request_id, step, status]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields',
                'message': 'request_id, step, and status are required'
            }), 400
        
        # Get requirement
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({
                'success': False,
                'error': 'Request not found'
            }), 404
        
        # Get current user
        current_user = None
        if user_id:
            current_user = get_db_session().query(User).filter_by(user_id=user_id).first()
        
        # Process each profile
        updated_profiles = []
        for profile_id in profile_ids:
            # Check if the profile_id looks like a UUID (contains hyphens and is 36 chars)
            # If not, assume it's a student_id
            profile = None
            if len(str(profile_id)) == 36 and '-' in str(profile_id):
                # Looks like UUID, try profile_id first
                try:
                    profile = get_db_session().query(Profile).filter_by(profile_id=profile_id).first()
                except:
                    # If UUID query fails, fall back to student_id
                    pass
            
            if not profile:
                # Try by student_id
                profile = get_db_session().query(Profile).filter_by(student_id=profile_id).first()
            
            if not profile:
                continue
            
            try:
                if step == 'screening':
                    # Create or update screening record
                    screening = get_db_session().query(Screening).filter_by(
                        requirement_id=requirement.requirement_id,
                        profile_id=profile.profile_id
                    ).first()
                    
                    if not screening:
                        screening = Screening(
                            requirement_id=requirement.requirement_id,
                            profile_id=profile.profile_id,
                            start_time=datetime.utcnow(),
                            status=ScreeningStatusEnum(status),
                            status_timestamp=datetime.utcnow(),
                            created_by=current_user.user_id if current_user else None
                        )
                        get_db_session().add(screening)
                    else:
                        screening.status = ScreeningStatusEnum(status)
                        screening.status_timestamp = datetime.utcnow()
                        screening.updated_by = current_user.user_id if current_user else None
                    
                    # Auto-update requirement status to Candidate_Submission when screening activity occurs
                    try:
                        if requirement.status != RequirementStatusEnum.Candidate_Submission:
                            requirement.status = RequirementStatusEnum.Candidate_Submission
                            requirement.updated_at = datetime.utcnow()
                    except Exception as e:
                        current_app.logger.warning(f"Could not set requirement status to Candidate_Submission: {str(e)}")
                
                elif step == 'interview_scheduled':
                    interview_scheduled = get_db_session().query(InterviewScheduled).filter_by(
                        requirement_id=requirement.requirement_id,
                        profile_id=profile.profile_id
                    ).first()
                    
                    if not interview_scheduled:
                        interview_scheduled = InterviewScheduled(
                            requirement_id=requirement.requirement_id,
                            profile_id=profile.profile_id,
                            start_time=datetime.utcnow(),
                            status=InterviewScheduledStatusEnum(status),
                            status_timestamp=datetime.utcnow(),
                            created_by=current_user.user_id if current_user else None
                        )
                        get_db_session().add(interview_scheduled)
                    else:
                        interview_scheduled.status = InterviewScheduledStatusEnum(status)
                        interview_scheduled.status_timestamp = datetime.utcnow()
                        interview_scheduled.updated_by = current_user.user_id if current_user else None
                
                elif step == 'interview_round_1':
                    round1 = get_db_session().query(InterviewRoundOne).filter_by(
                        requirement_id=requirement.requirement_id,
                        profile_id=profile.profile_id
                    ).first()
                    
                    if not round1:
                        round1 = InterviewRoundOne(
                            requirement_id=requirement.requirement_id,
                            profile_id=profile.profile_id,
                            start_time=datetime.utcnow(),
                            status=InterviewRoundOneStatusEnum(status),
                            status_timestamp=datetime.utcnow(),
                            created_by=current_user.user_id if current_user else None
                        )
                        get_db_session().add(round1)
                    else:
                        round1.status = InterviewRoundOneStatusEnum(status)
                        round1.status_timestamp = datetime.utcnow()
                        round1.updated_by = current_user.user_id if current_user else None
                
                elif step == 'interview_round_2':
                    round2 = get_db_session().query(InterviewRoundTwo).filter_by(
                        requirement_id=requirement.requirement_id,
                        profile_id=profile.profile_id
                    ).first()
                    
                    if not round2:
                        round2 = InterviewRoundTwo(
                            requirement_id=requirement.requirement_id,
                            profile_id=profile.profile_id,
                            start_time=datetime.utcnow(),
                            status=InterviewRoundTwoStatusEnum(status),
                            status_timestamp=datetime.utcnow(),
                            created_by=current_user.user_id if current_user else None
                        )
                        get_db_session().add(round2)
                    else:
                        round2.status = InterviewRoundTwoStatusEnum(status)
                        round2.status_timestamp = datetime.utcnow()
                        round2.updated_by = current_user.user_id if current_user else None
                
                elif step == 'offered':
                    offer = get_db_session().query(Offer).filter_by(
                        requirement_id=requirement.requirement_id,
                        profile_id=profile.profile_id
                    ).first()
                    
                    if not offer:
                        offer = Offer(
                            requirement_id=requirement.requirement_id,
                            profile_id=profile.profile_id,
                            active=status == 'offered',
                            created_by=current_user.user_id if current_user else None
                        )
                        get_db_session().add(offer)
                    else:
                        offer.active = status == 'offered'
                        offer.updated_by = current_user.user_id if current_user else None
                
                elif step == 'onboarding':
                    # Create or update onboarding record
                    onboarding = get_db_session().query(Onboarding).filter_by(
                        requirement_id=requirement.requirement_id,
                        profile_id=profile.profile_id
                    ).first()
                    
                    if not onboarding:
                        onboarding = Onboarding(
                            requirement_id=requirement.requirement_id,
                            profile_id=profile.profile_id,
                            status=OnboardingStatusEnum(status),
                            created_by=current_user.user_id if current_user else None
                        )
                        get_db_session().add(onboarding)
                    else:
                        onboarding.status = OnboardingStatusEnum(status)
                        onboarding.updated_by = current_user.user_id if current_user else None
                    
                    # Also update profile status for backward compatibility
                    if status == 'onboarded':
                        profile.status = 'onboarded'
                    elif status == 'rejected':
                        profile.status = 'rejected'
                    profile.updated_by = current_user.user_id if current_user else None
                
                updated_profiles.append(str(profile.profile_id))
                
            except Exception as e:
                current_app.logger.error(f"Error updating {step} for profile {profile_id}: {str(e)}")
                continue
        
        # Auto-update requirement status for interview stages
        if step in ['interview_scheduled', 'interview_round_1', 'interview_round_2'] and updated_profiles:
            try:
                # Set requirement status to Interview_Scheduled for any interview stage
                if requirement.status != RequirementStatusEnum.Interview_Scheduled:
                    requirement.status = RequirementStatusEnum.Interview_Scheduled
                    requirement.updated_at = datetime.utcnow()
                    current_app.logger.info(f"Auto-updated requirement {request_id} status to Interview_Scheduled due to {step} activity")
            except Exception as e:
                current_app.logger.error(f"Error auto-updating requirement status: {str(e)}")
        
        get_db_session().commit()
        
        return jsonify({
            'success': True,
            'message': f'Updated {step} status for {len(updated_profiles)} profiles',
            'updated_profiles': updated_profiles
        })
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f'Error updating workflow step: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'Failed to update workflow step'
        }), 500

@workflow_bp.route('/workflow-progress/<request_id>', methods=['POST'])
@require_domain_auth
def save_workflow_progress(request_id):
    """Save workflow progress for a specific request (legacy compatibility)"""
    try:
        # This endpoint is kept for compatibility but the actual workflow 
        # updates should use the /workflow-step endpoint
        data = request.get_json()
        current_app.logger.info(f'Legacy workflow progress save requested for {request_id}')
        
        return jsonify({
            'success': True,
            'message': 'Use /workflow-step endpoint for updating workflow progress',
            'data': {
                'request_id': request_id,
                'current_step': data.get('current_step', 'candidate_submission'),
                'session_start_time': data.get('session_start_time', int(datetime.utcnow().timestamp() * 1000))
            }
        })
        
    except Exception as e:
        current_app.logger.error(f'Error in legacy workflow progress save for {request_id}: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'Failed to save workflow progress'
        }), 500

@workflow_bp.route('/workflow/<request_id>/state', methods=['GET'])
def get_workflow_state(request_id):
    """Get workflow state for a specific request"""
    try:
        # Validate request_id exists
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({
                'success': False,
                'error': 'Request not found',
                'message': f'No requirement found with request_id: {request_id}'
            }), 404
        
        # Get profiles linked to this requirement
        profiles = get_db_session().query(Profile).filter(
            Profile.requirement_id == requirement.requirement_id,
            Profile.deleted_at.is_(None)
        ).all()
        
        # Get workflow data from the new models
        screening_records = get_db_session().query(Screening).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        interview_scheduled_records = get_db_session().query(InterviewScheduled).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        interview_round_one_records = get_db_session().query(InterviewRoundOne).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        interview_round_two_records = get_db_session().query(InterviewRoundTwo).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        offer_records = get_db_session().query(Offer).filter_by(requirement_id=requirement.requirement_id, is_deleted=False).all()
        
        # For onboarding, we'll use the profile status since onboarding table doesn't have profile_id
        onboarded_profiles = [p for p in profiles if p.status and p.status.value == 'onboarded']
        
        # Build workflow state structure
        # Map profile_id -> student_id for frontend consistency
        profile_id_to_student = {str(p.profile_id): p.student_id for p in profiles}
        workflow_state = {
            'currentStep': 'candidate_submission',
            'selectedProfiles': [],
            'rejectedProfiles': [],
            'screeningSelected': [profile_id_to_student.get(str(r.profile_id)) for r in screening_records if r.status == ScreeningStatusEnum.selected and profile_id_to_student.get(str(r.profile_id))],
            'screeningRejected': [profile_id_to_student.get(str(r.profile_id)) for r in screening_records if r.status == ScreeningStatusEnum.rejected and profile_id_to_student.get(str(r.profile_id))],
            'interviewScheduled': [profile_id_to_student.get(str(r.profile_id)) for r in interview_scheduled_records if r.status == InterviewScheduledStatusEnum.scheduled and profile_id_to_student.get(str(r.profile_id))],
            'interviewRescheduled': [profile_id_to_student.get(str(r.profile_id)) for r in interview_scheduled_records if r.status == InterviewScheduledStatusEnum.rescheduled and profile_id_to_student.get(str(r.profile_id))],
            'round1Selected': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_one_records if r.status == InterviewRoundOneStatusEnum.select and profile_id_to_student.get(str(r.profile_id))],
            'round1Rejected': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_one_records if r.status == InterviewRoundOneStatusEnum.reject and profile_id_to_student.get(str(r.profile_id))],
            'round1Rescheduled': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_one_records if r.status == InterviewRoundOneStatusEnum.reschedule and profile_id_to_student.get(str(r.profile_id))],
            'round2Selected': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_two_records if r.status == InterviewRoundTwoStatusEnum.select and profile_id_to_student.get(str(r.profile_id))],
            'round2Rejected': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_two_records if r.status == InterviewRoundTwoStatusEnum.reject and profile_id_to_student.get(str(r.profile_id))],
            'round2Rescheduled': [profile_id_to_student.get(str(r.profile_id)) for r in interview_round_two_records if r.status == InterviewRoundTwoStatusEnum.reschedule and profile_id_to_student.get(str(r.profile_id))],
            'offered': [profile_id_to_student.get(str(r.profile_id)) for r in offer_records if r.active and profile_id_to_student.get(str(r.profile_id))],
            'onboarding': [p.student_id for p in onboarded_profiles],
            'stepTimestamps': {}
        }
        
        # Build step timestamps for each profile
        profile_timestamps = {}
        for profile in profiles:
            profile_id = str(profile.profile_id)
            profile_timestamps[profile_id] = {}
            
            # Add timestamps for each step
            screening_record = next((r for r in screening_records if str(r.profile_id) == profile_id), None)
            if screening_record:
                if screening_record.status == ScreeningStatusEnum.selected:
                    profile_timestamps[profile_id]['screening_selected'] = screening_record.created_at.isoformat()
                elif screening_record.status == ScreeningStatusEnum.rejected:
                    profile_timestamps[profile_id]['screening_rejected'] = screening_record.created_at.isoformat()
            
            interview_scheduled_record = next((r for r in interview_scheduled_records if str(r.profile_id) == profile_id), None)
            if interview_scheduled_record:
                if interview_scheduled_record.status == InterviewScheduledStatusEnum.scheduled:
                    profile_timestamps[profile_id]['interview_scheduled'] = interview_scheduled_record.created_at.isoformat()
                elif interview_scheduled_record.status == InterviewScheduledStatusEnum.rescheduled:
                    profile_timestamps[profile_id]['interview_rescheduled'] = interview_scheduled_record.created_at.isoformat()
            
            round1_record = next((r for r in interview_round_one_records if str(r.profile_id) == profile_id), None)
            if round1_record:
                if round1_record.status == InterviewRoundOneStatusEnum.select:
                    profile_timestamps[profile_id]['round1_selected'] = round1_record.created_at.isoformat()
                elif round1_record.status == InterviewRoundOneStatusEnum.reject:
                    profile_timestamps[profile_id]['round1_rejected'] = round1_record.created_at.isoformat()
                elif round1_record.status == InterviewRoundOneStatusEnum.reschedule:
                    profile_timestamps[profile_id]['round1_rescheduled'] = round1_record.created_at.isoformat()
            
            round2_record = next((r for r in interview_round_two_records if str(r.profile_id) == profile_id), None)
            if round2_record:
                if round2_record.status == InterviewRoundTwoStatusEnum.select:
                    profile_timestamps[profile_id]['round2_selected'] = round2_record.created_at.isoformat()
                elif round2_record.status == InterviewRoundTwoStatusEnum.reject:
                    profile_timestamps[profile_id]['round2_rejected'] = round2_record.created_at.isoformat()
                elif round2_record.status == InterviewRoundTwoStatusEnum.reschedule:
                    profile_timestamps[profile_id]['round2_rescheduled'] = round2_record.created_at.isoformat()
            
            offer_record = next((r for r in offer_records if str(r.profile_id) == profile_id), None)
            if offer_record:
                profile_timestamps[profile_id]['offered'] = offer_record.created_at.isoformat()
            
            # For onboarding, we'll use the profile's updated_at if it has onboarded status
            if profile.status and profile.status.value == 'onboarded':
                profile_timestamps[profile_id]['onboarding'] = profile.updated_at.isoformat()
        
        workflow_state['stepTimestamps'] = profile_timestamps
        
        # Determine current step based on requirement status (use enum values)
        if requirement.status:
            status_to_step = {
                'Open': 'candidate_submission',
                'Candidate_Submission': 'candidate_submission',
                'Interview_Scheduled': 'interview_scheduled',
                'Offer_Recommendation': 'offered',
                'On_Boarding': 'onboarding',
                'Closed': 'onboarding'
            }
            workflow_state['currentStep'] = status_to_step.get(getattr(requirement.status, 'value', str(requirement.status)), 'candidate_submission')
            # Add display-friendly status for frontend (no underscores)
            workflow_state['requirementStatus'] = getattr(requirement.status, 'value', str(requirement.status))
            workflow_state['requirementStatusDisplay'] = format_enum_for_display(workflow_state['requirementStatus'])
        
        return jsonify(workflow_state)
        
    except Exception as e:
        current_app.logger.error(f'Error getting workflow state for {request_id}: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'Failed to retrieve workflow state'
        }), 500

@workflow_bp.route('/workflow/<request_id>/state', methods=['POST'])
def save_workflow_state(request_id):
    """Save workflow state for a specific request"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        # Validate request_id exists
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({
                'success': False,
                'error': 'Request not found',
                'message': f'No requirement found with request_id: {request_id}'
            }), 404
        
        # Get current user (if available)
        current_user = None
        auth_header = request.headers.get('Authorization')
        if auth_header:
            try:
                parts = auth_header.split(' ')
                if len(parts) == 2 and parts[0] == 'Bearer':
                    username = parts[1].strip()
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
        
        # Update current step if provided
        if 'currentStep' in data:
            # Map frontend step names to requirement status enum values
            step_to_status = {
                'candidate_submission': 'Candidate_Submission',
                'interview_scheduled': 'Interview_Scheduled', 
                'offered': 'Offer_Recommendation',
                'onboarding': 'On_Boarding'
            }
            new_status = step_to_status.get(data['currentStep'])
            if new_status:
                # Import the enum to get the proper enum value
                from app.models.requirement import RequirementStatusEnum
                try:
                    requirement.status = RequirementStatusEnum(new_status)
                    requirement.updated_by = current_user.user_id if current_user else None
                except ValueError:
                    current_app.logger.warning(f"Invalid status value: {new_status}")
                    # Don't update status if it's invalid
        
        # Save the state data (this is mainly for frontend state management)
        # The actual workflow updates should go through the /workflow-step endpoint
        get_db_session().commit()
        
        return jsonify({
            'success': True,
            'message': 'Workflow state saved successfully'
        })
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f'Error saving workflow state for {request_id}: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'Failed to save workflow state'
        }), 500

@workflow_bp.route('/workflow-progress/<request_id>', methods=['DELETE'])
def delete_workflow_progress(request_id):
    """Delete workflow progress for a specific request"""
    try:
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({
                'success': False,
                'error': 'Request not found'
            }), 404
        
        # Soft delete all workflow records for this requirement
        get_db_session().query(Screening).filter_by(requirement_id=requirement.requirement_id).update({'is_deleted': True})
        get_db_session().query(InterviewScheduled).filter_by(requirement_id=requirement.requirement_id).update({'is_deleted': True})
        get_db_session().query(InterviewRoundOne).filter_by(requirement_id=requirement.requirement_id).update({'is_deleted': True})
        get_db_session().query(InterviewRoundTwo).filter_by(requirement_id=requirement.requirement_id).update({'is_deleted': True})
        get_db_session().query(Offer).filter_by(requirement_id=requirement.requirement_id).update({'is_deleted': True})
        
        get_db_session().commit()
        
        return jsonify({
            'success': True,
            'message': 'Workflow progress deleted successfully'
        })
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f'Error deleting workflow progress for {request_id}: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'Failed to delete workflow progress'
        }), 500

@workflow_bp.route('/workflow-progress/<request_id>/reset', methods=['POST'])
def reset_workflow_progress(request_id):
    """Reset workflow progress for a specific request"""
    try:
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({
                'success': False,
                'error': 'Request not found'
            }), 404
        
        # Reset all workflow records for this requirement
        get_db_session().query(Screening).filter_by(requirement_id=requirement.requirement_id).delete()
        get_db_session().query(InterviewScheduled).filter_by(requirement_id=requirement.requirement_id).delete()
        get_db_session().query(InterviewRoundOne).filter_by(requirement_id=requirement.requirement_id).delete()
        get_db_session().query(InterviewRoundTwo).filter_by(requirement_id=requirement.requirement_id).delete()
        get_db_session().query(Offer).filter_by(requirement_id=requirement.requirement_id).delete()
        
        # Reset profile statuses
        profiles = get_db_session().query(Profile).filter_by(requirement_id=requirement.requirement_id).all()
        for profile in profiles:
            profile.status = None
        
        get_db_session().commit()
        
        return jsonify({
            'success': True,
            'message': 'Workflow progress reset successfully',
            'data': {
                'request_id': request_id,
                'current_step': 'candidate_submission',
                'session_start_time': int(datetime.utcnow().timestamp() * 1000)
            }
        })
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f'Error resetting workflow progress for {request_id}: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'Failed to reset workflow progress'
        }), 500