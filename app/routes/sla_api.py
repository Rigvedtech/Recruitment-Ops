from flask import Blueprint, jsonify, request, current_app, g
from app.services.sla_service import SLAService
from app.models.sla_config import SLAConfig
from app.models.sla_tracker import SLATracker
from app.models.requirement import Requirement
from app.database import db
from app.utils.enum_utils import EnumRegistry
from datetime import datetime, timedelta
import traceback
from app.middleware.domain_auth import require_domain_auth
from flask_jwt_extended import jwt_required, get_jwt_identity

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

sla_bp = Blueprint('sla', __name__, url_prefix='/api/sla')

# SLA Configuration Endpoints
@sla_bp.route('/config', methods=['GET'])
@require_domain_auth
def get_sla_configs():
    """Get all SLA configurations for the current domain"""
    try:
        configs = SLAService.get_all_active_configs()
        return jsonify([config.to_dict() for config in configs])
    except Exception as e:
        current_app.logger.error(f"Error fetching SLA configs: {str(e)}")
        return jsonify({'error': 'Failed to fetch SLA configurations'}), 500

@sla_bp.route('/config/<string:step_name>', methods=['GET'])
@require_domain_auth
def get_sla_config(step_name):
    """Get SLA configuration for a specific step"""
    try:
        # Validate step name against DB enum values
        if not EnumRegistry.is_valid('step_name', step_name):
            return jsonify({'error': f'Invalid step name: {step_name}'}), 400
        
        config = SLAService.get_sla_config(step_name)
        if not config:
            return jsonify({'error': f'SLA configuration not found for step: {step_name}'}), 404
        
        return jsonify(config.to_dict())
    except Exception as e:
        current_app.logger.error(f"Error fetching SLA config for {step_name}: {str(e)}")
        return jsonify({'error': 'Failed to fetch SLA configuration'}), 500

@sla_bp.route('/config/<string:step_name>', methods=['PUT'])
@require_domain_auth
def update_sla_config(step_name):
    """Update SLA configuration for a step"""
    try:
        # Validate step name against DB enum values
        if not EnumRegistry.is_valid('step_name', step_name):
            return jsonify({'error': f'Invalid step name: {step_name}'}), 400
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        sla_hours = data.get('sla_hours')
        sla_days = data.get('sla_days')
        description = data.get('description')
        
        if sla_hours is None or sla_days is None:
            return jsonify({'error': 'sla_hours and sla_days are required'}), 400
        
        config = SLAService.update_sla_config(step_name, sla_hours, sla_days, description)
        return jsonify(config.to_dict())
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        current_app.logger.error(f"Error updating SLA config for {step_name}: {str(e)}")
        return jsonify({'error': 'Failed to update SLA configuration'}), 500

@sla_bp.route('/config/initialize', methods=['POST'])
@require_domain_auth
def initialize_sla_configs():
    """Initialize default SLA configurations"""
    try:
        SLAService.initialize_default_configs()
        return jsonify({'message': 'SLA configurations initialized successfully'})
    except Exception as e:
        current_app.logger.error(f"Error initializing SLA configs: {str(e)}")
        return jsonify({'error': 'Failed to initialize SLA configurations'}), 500

# SLA Tracking Endpoints
@sla_bp.route('/tracking/start', methods=['POST'])
def start_sla_tracking():
    """Start SLA tracking for a workflow step"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        requirement_id = data.get('requirement_id')
        step_name = data.get('step_name')
        user_id = data.get('user_id')
        notes = data.get('notes')
        
        if not requirement_id or not step_name:
            return jsonify({'error': 'requirement_id and step_name are required'}), 400
        
        # Validate step name against DB enum values
        if not EnumRegistry.is_valid('step_name', step_name):
            return jsonify({'error': f'Invalid step name: {step_name}'}), 400
        
        tracker = SLAService.start_workflow_step(
            requirement_id=requirement_id,
            step_name=step_name,
            user_id=user_id,
            notes=notes
        )
        
        return jsonify(tracker.to_dict())
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error starting SLA tracking: {str(e)}")
        return jsonify({'error': 'Failed to start SLA tracking'}), 500

@sla_bp.route('/tracking/complete', methods=['POST'])
def complete_sla_tracking():
    """Complete SLA tracking for a workflow step"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        requirement_id = data.get('requirement_id')
        step_name = data.get('step_name')
        completion_time = data.get('completion_time')
        
        if not requirement_id or not step_name:
            return jsonify({'error': 'requirement_id and step_name are required'}), 400
        
        # Validate step name against DB enum values
        if not EnumRegistry.is_valid('step_name', step_name):
            return jsonify({'error': f'Invalid step name: {step_name}'}), 400
        
        # Parse completion time if provided
        parsed_completion_time = None
        if completion_time:
            try:
                parsed_completion_time = datetime.fromisoformat(completion_time.replace('Z', '+00:00'))
            except ValueError:
                return jsonify({'error': 'Invalid completion_time format'}), 400
        
        tracker = SLAService.complete_workflow_step(
            requirement_id=requirement_id,
            step_name=step_name,
            completion_time=parsed_completion_time
        )
        
        if not tracker:
            return jsonify({'error': f'No active SLA tracking found for {requirement_id}:{step_name}'}), 404
        
        return jsonify(tracker.to_dict())
    except Exception as e:
        current_app.logger.error(f"Error completing SLA tracking: {str(e)}")
        return jsonify({'error': 'Failed to complete SLA tracking'}), 500

@sla_bp.route('/tracking/workflow/<string:requirement_id>', methods=['GET'])
def get_workflow_sla_status(requirement_id):
    """Get SLA status for a specific workflow"""
    try:
        # Check if requirement_id is actually a request_id (starts with 'Req')
        if requirement_id.startswith('Req'):
            # It's a request_id, so we need to get the actual requirement_id
            requirement = get_db_session().query(Requirement).filter_by(request_id=requirement_id).first()
            if not requirement:
                return jsonify({'error': 'Requirement not found'}), 404
            actual_requirement_id = str(requirement.requirement_id)
        else:
            # It's a UUID requirement_id
            actual_requirement_id = requirement_id
        
        sla_status = SLAService.get_workflow_sla_status(actual_requirement_id)
        return jsonify(sla_status)
    except Exception as e:
        current_app.logger.error(f"Error fetching SLA status for {requirement_id}: {str(e)}")
        return jsonify({'error': 'Failed to fetch SLA status'}), 500

@sla_bp.route('/tracking/auto-start/<string:requirement_id>', methods=['POST'])
def auto_start_workflow_steps(requirement_id):
    """Automatically start SLA tracking for workflow steps based on current status"""
    try:
        # Check if requirement_id is actually a request_id (starts with 'Req')
        if requirement_id.startswith('Req'):
            # It's a request_id, so query by request_id
            requirement = get_db_session().query(Requirement).filter_by(request_id=requirement_id).first()
        else:
            # It's a UUID requirement_id
            requirement = get_db_session().query(Requirement).filter_by(requirement_id=requirement_id).first()
        
        if not requirement:
            return jsonify({'error': 'Requirement not found'}), 404
        
        # Get assigned user
        user_id = requirement.user_id
        
        started_trackers = SLAService.auto_start_workflow_steps(
            requirement_id=str(requirement.requirement_id),
            current_status=requirement.status if requirement.status else 'Open',
            user_id=str(user_id) if user_id else None
        )
        
        return jsonify({
            'message': f'Started {len(started_trackers)} SLA tracking entries',
            'started_trackers': [tracker.to_dict() for tracker in started_trackers]
        })
    except Exception as e:
        current_app.logger.error(f"Error auto-starting SLA tracking for {requirement_id}: {str(e)}")
        return jsonify({'error': 'Failed to auto-start SLA tracking'}), 500

@sla_bp.route('/tracking/auto-start-by-request/<string:request_id>', methods=['POST'])
def auto_start_workflow_steps_by_request(request_id):
    """Automatically start SLA tracking for workflow steps using request_id"""
    try:
        # Get the requirement by request_id
        requirement = get_db_session().query(Requirement).filter_by(request_id=request_id).first()
        if not requirement:
            return jsonify({'error': 'Requirement not found'}), 404
        
        # Get assigned user
        user_id = requirement.user_id
        
        started_trackers = SLAService.auto_start_workflow_steps(
            requirement_id=str(requirement.requirement_id),
            current_status=requirement.status if requirement.status else 'Open',
            user_id=str(user_id) if user_id else None
        )
        
        return jsonify({
            'message': f'Started {len(started_trackers)} SLA tracking entries',
            'started_trackers': [tracker.to_dict() for tracker in started_trackers]
        })
    except Exception as e:
        current_app.logger.error(f"Error auto-starting SLA tracking for request {request_id}: {str(e)}")
        return jsonify({'error': 'Failed to auto-start SLA tracking'}), 500

# SLA Dashboard Endpoints
@sla_bp.route('/backfill/open-steps', methods=['POST'])
@require_domain_auth
def backfill_open_steps():
    """Backfill missing 'open' step trackers for existing requirements with 'Open' status"""
    try:
        from app.models.requirement import Requirement
        from app.models.sla_tracker import SLATracker
        from app.models.sla_config import SLAConfig
        
        # Get all requirements with 'Open' status that don't have an 'open' step tracker
        open_requirements = get_db_session().query(Requirement).filter(
            Requirement.status == 'Open',
            Requirement.deleted_at.is_(None)
        ).all()
        
        backfilled_count = 0
        skipped_count = 0
        errors = []
        
        for requirement in open_requirements:
            try:
                # Check if 'open' step tracker already exists
                existing_tracker = get_db_session().query(SLATracker).filter_by(
                    requirement_id=requirement.requirement_id,
                    step_name='open',
                    step_completed_at=None
                ).first()
                
                if existing_tracker:
                    skipped_count += 1
                    continue
                
                # Get SLA config for 'open' step
                config = SLAConfig.get_config_by_step('open')
                if not config:
                    current_app.logger.warning(f"No SLA config found for 'open' step, skipping requirement {requirement.requirement_id}")
                    errors.append(f"Requirement {requirement.request_id}: No SLA config for 'open' step")
                    continue
                
                # Create 'open' step tracker with requirement's created_at as start time
                tracker = SLATracker(
                    requirement_id=requirement.requirement_id,
                    step_name='open',
                    step_started_at=requirement.created_at or datetime.utcnow(),
                    sla_hours=config.sla_hours,
                    sla_days=config.sla_days,
                    user_id=requirement.user_id,
                    sla_status='pending'
                )
                
                # Calculate initial metrics
                tracker.calculate_sla_metrics()
                
                get_db_session().add(tracker)
                backfilled_count += 1
                
            except Exception as e:
                error_msg = f"Error backfilling requirement {requirement.request_id}: {str(e)}"
                current_app.logger.error(error_msg)
                errors.append(error_msg)
        
        get_db_session().commit()
        
        return jsonify({
            'success': True,
            'message': f'Backfilled {backfilled_count} requirements, skipped {skipped_count} (already have trackers)',
            'backfilled_count': backfilled_count,
            'skipped_count': skipped_count,
            'errors': errors if errors else None
        }), 200
        
    except Exception as e:
        get_db_session().rollback()
        current_app.logger.error(f"Error in backfill_open_steps: {str(e)}")
        return jsonify({'error': 'Failed to backfill open steps'}), 500

@sla_bp.route('/dashboard/global-metrics', methods=['GET'])
def get_global_sla_metrics():
    """Get global SLA metrics for dashboard"""
    try:
        days = request.args.get('days', default=30, type=int)
        metrics = SLAService.get_global_sla_metrics(days)
        
        # Transform the response to match frontend expectations
        transformed_metrics = {
            'total_requests': metrics.get('total_steps', 0),
            'on_time_requests': metrics.get('on_time_steps', 0),
            'breached_requests': metrics.get('breached_steps', 0),
            'compliance_percentage': metrics.get('compliance_percentage', 0),
            'average_tat_hours': metrics.get('average_tat_hours', 0),
            'average_tat_days': metrics.get('average_tat_days', 0),
            'in_progress_steps': metrics.get('in_progress_steps', 0),
            'real_time_breached': metrics.get('real_time_breached', 0),
            'total_breach_hours': metrics.get('total_breach_hours', 0)
        }
        
        return jsonify(transformed_metrics)
    except Exception as e:
        current_app.logger.error(f"Error fetching global SLA metrics: {str(e)}")
        return jsonify({'error': 'Failed to fetch global SLA metrics'}), 500

@sla_bp.route('/dashboard/metrics', methods=['GET'])
def get_sla_dashboard_metrics():
    """Get SLA dashboard metrics"""
    try:
        days = request.args.get('days', default=30, type=int)
        metrics = SLAService.get_global_sla_metrics(days)
        return jsonify(metrics)
    except Exception as e:
        current_app.logger.error(f"Error fetching SLA dashboard metrics: {str(e)}")
        return jsonify({'error': 'Failed to fetch SLA dashboard metrics'}), 500

@sla_bp.route('/dashboard/recruiter-metrics', methods=['GET'])
def get_all_recruiter_metrics():
    """Get SLA metrics for all recruiters"""
    try:
        days = request.args.get('days', default=30, type=int)
        
        # Get all unique users from SLA tracker
        users = get_db_session().query(SLATracker.user_id).distinct().all()
        recruiter_metrics = []
        
        for (user_id,) in users:
            if user_id:  # Skip None/empty users
                try:
                    metrics = SLAService.get_recruiter_sla_metrics(user_id, days)
                    # Transform to match frontend expectations
                    transformed_metrics = {
                        'user_id': metrics.get('recruiter', user_id),
                        'total_requests': metrics.get('total_steps', 0),
                        'on_time_requests': metrics.get('on_time_steps', 0),
                        'breached_requests': metrics.get('breached_steps', 0),
                        'compliance_percentage': metrics.get('compliance_percentage', 0),
                        'average_tat_hours': metrics.get('average_tat_hours', 0),
                        'average_tat_days': metrics.get('average_tat_days', 0)
                    }
                    recruiter_metrics.append(transformed_metrics)
                except Exception as e:
                    current_app.logger.warning(f"Error fetching metrics for user {user_id}: {str(e)}")
                    continue
        
        return jsonify(recruiter_metrics)
    except Exception as e:
        current_app.logger.error(f"Error fetching all recruiter metrics: {str(e)}")
        return jsonify({'error': 'Failed to fetch recruiter metrics'}), 500

@sla_bp.route('/dashboard/recruiter/<string:user_id>', methods=['GET'])
def get_recruiter_sla_metrics(user_id):
    """Get SLA metrics for a specific recruiter"""
    try:
        days = request.args.get('days', default=30, type=int)
        metrics = SLAService.get_recruiter_sla_metrics(user_id, days)
        return jsonify(metrics)
    except Exception as e:
        current_app.logger.error(f"Error fetching recruiter SLA metrics: {str(e)}")
        return jsonify({'error': 'Failed to fetch recruiter SLA metrics'}), 500

@sla_bp.route('/dashboard/alerts', methods=['GET'])
def get_sla_alerts():
    """Get SLA breach alerts"""
    try:
        # Update real-time metrics for in-progress steps
        SLATracker.update_in_progress_metrics()
        
        alerts = SLAService.check_sla_alerts()
        
        # Add created_at field to each alert for frontend compatibility
        for alert in alerts:
            # Use IST timezone instead of UTC
            import pytz
            ist = pytz.timezone('Asia/Kolkata')
            default_time = datetime.now(ist).isoformat()
            alert['created_at'] = alert.get('started_at', default_time)
        
        # Return just the alerts array for the new dashboard
        return jsonify(alerts)
    except Exception as e:
        current_app.logger.error(f"Error fetching SLA alerts: {str(e)}")
        return jsonify({'error': 'Failed to fetch SLA alerts'}), 500

@sla_bp.route('/dashboard/breaching-requests', methods=['GET'])
def get_breaching_requests():
    """Get all requests currently breaching SLA"""
    try:
        # Update real-time metrics for in-progress steps
        SLATracker.update_in_progress_metrics()
        
        breaching_steps = SLATracker.get_breaching_steps()
        breaching_requests = []
        
        for step in breaching_steps:
            # Get requirement details
            requirement = get_db_session().query(Requirement).filter_by(requirement_id=step.requirement_id).first()
            
            # Calculate breach time in a clean format
            breach_hours = step.sla_breach_hours or 0
            breach_days = breach_hours / 24
            breach_days_rounded = round(breach_days, 1)
            
            # Format breach time as "X days" or "X hours" if less than 1 day
            if breach_days_rounded >= 1:
                breach_time_display = f"{int(breach_days_rounded)} days"
            else:
                breach_time_display = f"{int(breach_hours)} hours"
            
            breaching_requests.append({
                'requirement_id': step.requirement_id,
                'step_name': step.step_name,
                'step_display_name': step.step_name,
                'breach_hours': breach_hours,
                'breach_days': breach_days_rounded,
                'breach_time_display': breach_time_display,
                'user_id': step.user_id,
                'step_started_at': step.step_started_at.isoformat(),
                'sla_limit_hours': step.sla_hours,
                'requirement': {
                    'job_title': requirement.job_title if requirement else None,
                    'company_name': requirement.company_name if requirement and requirement.company_name else None,
                    'status': requirement.status if requirement and requirement.status else None
                }
            })
        
        # Return just the array for the new dashboard
        return jsonify(breaching_requests)
    except Exception as e:
        current_app.logger.error(f"Error fetching breaching requests: {str(e)}")
        return jsonify({'error': 'Failed to fetch breaching requests'}), 500

@sla_bp.route('/dashboard/step-wise-metrics', methods=['GET'])
def get_step_wise_metrics_new():
    """Get step-wise SLA metrics for new dashboard"""
    try:
        days = request.args.get('days', default=30, type=int)
        metrics = SLAService.get_global_sla_metrics(days)
        
        # Format step metrics for frontend
        step_metrics = []
        for step_name, step_data in metrics['step_wise_metrics'].items():
            step_metrics.append({
                'step_name': step_name,
                'step_display_name': step_data['step_display_name'],
                'total_requests': step_data['total_steps'],
                'on_time_requests': step_data['on_time_steps'],
                'breached_requests': step_data['breached_steps'],
                'compliance_percentage': round(step_data['compliance_percentage'], 2),
                'average_duration_hours': round(step_data['average_duration_hours'], 2),
                'average_duration_days': round(step_data['average_duration_hours'] / 24, 2)
            })
        
        # Sort by compliance percentage (descending)
        step_metrics.sort(key=lambda x: x['compliance_percentage'], reverse=True)
        
        return jsonify(step_metrics)
    except Exception as e:
        current_app.logger.error(f"Error fetching step-wise metrics: {str(e)}")
        return jsonify({'error': 'Failed to fetch step-wise metrics'}), 500

@sla_bp.route('/dashboard/step-metrics', methods=['GET'])
def get_step_wise_metrics():
    """Get step-wise SLA metrics"""
    try:
        days = request.args.get('days', default=30, type=int)
        metrics = SLAService.get_global_sla_metrics(days)
        
        # Format step metrics for frontend
        step_metrics = []
        for step_name, step_data in metrics['step_wise_metrics'].items():
            step_metrics.append({
                'step_name': step_name,
                'step_display_name': step_data['step_display_name'],
                'total_steps': step_data['total_steps'],
                'on_time_steps': step_data['on_time_steps'],
                'breached_steps': step_data['breached_steps'],
                'compliance_percentage': round(step_data['compliance_percentage'], 2),
                'average_duration_hours': round(step_data['average_duration_hours'], 2),
                'average_duration_days': round(step_data['average_duration_hours'] / 24, 2)
            })
        
        # Sort by compliance percentage (descending)
        step_metrics.sort(key=lambda x: x['compliance_percentage'], reverse=True)
        
        return jsonify({
            'step_metrics': step_metrics,
            'overall_metrics': {
                'total_steps': metrics['total_steps'],
                'compliance_percentage': metrics['compliance_percentage'],
                'average_tat_hours': metrics['average_tat_hours'],
                'average_tat_days': metrics['average_tat_days']
            }
        })
    except Exception as e:
        current_app.logger.error(f"Error fetching step-wise metrics: {str(e)}")
        return jsonify({'error': 'Failed to fetch step-wise metrics'}), 500

@sla_bp.route('/dashboard/trends', methods=['GET'])
def get_sla_trends():
    """Get SLA trends over time"""
    try:
        days = request.args.get('days', default=30, type=int)
        
        # Get daily metrics for the last N days
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        trends = []
        current_date = start_date
        
        # Get the actual date range of our SLA data
        earliest_sla_date = get_db_session().query(db.func.min(SLATracker.step_started_at)).scalar()
        latest_sla_date = get_db_session().query(db.func.max(SLATracker.step_started_at)).scalar()
        
        if earliest_sla_date and latest_sla_date:
            # Use the actual SLA data range instead of the requested range
            data_start_date = earliest_sla_date.date()
            data_end_date = latest_sla_date.date()
        else:
            # Fallback to requested range if no SLA data exists
            data_start_date = start_date.date()
            data_end_date = end_date.date()
        
        current_date = data_start_date
        while current_date <= data_end_date:
            next_date = current_date + timedelta(days=1)
            
            # Get all steps that were active on this day (started before next_date and not completed before current_date)
            daily_steps = get_db_session().query(SLATracker).filter(
                SLATracker.step_started_at < next_date,
                (SLATracker.step_completed_at.is_(None) | (SLATracker.step_completed_at >= current_date))
            ).all()
            
            # Calculate metrics for this day
            total_steps = len(daily_steps)
            
            if total_steps > 0:
                # Calculate compliance percentage based on current status
                on_time_steps = len([s for s in daily_steps if s.sla_status == 'on_time'])
                breached_steps = len([s for s in daily_steps if s.sla_status == 'breached'])
                in_progress_steps = len([s for s in daily_steps if s.sla_status == 'in_progress'])
                
                # Calculate average duration (only for completed steps)
                completed_steps = [s for s in daily_steps if s.step_completed_at]
                avg_duration = sum(s.actual_duration_hours or 0 for s in completed_steps) / len(completed_steps) if completed_steps else 0
                
                # Calculate compliance percentage (completed steps only)
                completed_on_time = len([s for s in completed_steps if s.sla_status == 'on_time'])
                compliance_percentage = (completed_on_time / len(completed_steps) * 100) if completed_steps else 0
                
                trends.append({
                    'date': current_date.strftime('%Y-%m-%d'),
                    'total_requests': total_steps,
                    'on_time_steps': on_time_steps,
                    'breached_steps': breached_steps,
                    'in_progress_steps': in_progress_steps,
                    'compliance_percentage': round(compliance_percentage, 2),
                    'average_tat_hours': round(avg_duration, 2)
                })
            else:
                trends.append({
                    'date': current_date.strftime('%Y-%m-%d'),
                    'total_requests': 0,
                    'on_time_steps': 0,
                    'breached_steps': 0,
                    'in_progress_steps': 0,
                    'compliance_percentage': 0,
                    'average_tat_hours': 0
                })
            
            current_date = next_date
        
        return jsonify({
            'trends': trends,
            'date_range': {
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d'),
                'days': days
            }
        })
    except Exception as e:
        current_app.logger.error(f"Error fetching SLA trends: {str(e)}")
        return jsonify({'error': 'Failed to fetch SLA trends'}), 500

# Utility Endpoints
@sla_bp.route('/health', methods=['GET'])
def sla_health_check():
    """Health check for SLA service"""
    try:
        # Check if SLA configs exist
        configs = SLAService.get_all_active_configs()
        breaching_steps = SLATracker.get_breaching_steps()
        
        return jsonify({
            'status': 'healthy',
            'active_configs': len(configs),
            'breaching_steps': len(breaching_steps),
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        current_app.logger.error(f"SLA health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500
