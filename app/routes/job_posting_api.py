"""
Job Posting API - Handles job posting to external webhooks and status tracking
"""
from flask import Blueprint, jsonify, request, current_app, g
from app.database import db
from app.models.requirement import Requirement
from app.models.assignment import Assignment
from app.models.user import User
from app.middleware.domain_auth import require_domain_auth
from datetime import datetime

job_posting_bp = Blueprint('job_posting', __name__)


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
        try:
            session = db.session
            if hasattr(session, 'query'):
                return session
            else:
                current_app.logger.error("db.session does not have query method")
                from sqlalchemy.orm import sessionmaker
                Session = sessionmaker(bind=db.engine)
                return Session()
        except Exception as e:
            current_app.logger.error(f"Error getting db.session: {str(e)}")
            raise
    except Exception as e:
        current_app.logger.error(f"Error in get_db_session: {str(e)}")
        return db.session


def _get_assigned_recruiters_for_requirement(requirement_id, session):
    """Get the list of assigned recruiters (username and email) for a requirement"""
    try:
        assignments = session.query(
            User.username,
            User.email
        ).join(
            Assignment, Assignment.user_id == User.user_id
        ).filter(
            Assignment.requirement_id == requirement_id,
            Assignment.is_active == True,
            User.role == 'recruiter'
        ).all()
        
        return [{'username': a.username, 'email': a.email} for a in assignments]
    except Exception as e:
        current_app.logger.error(f"Error getting assigned recruiters: {str(e)}")
        return []


@job_posting_bp.route('/api/job-posting/<string:request_id>/status', methods=['PUT'])
@require_domain_auth
def update_job_posting_status(request_id):
    """
    Update the job posting status for a requirement.
    Sets is_job_posted to True and records the timestamp.
    """
    try:
        # Check admin role
        current_user = getattr(request, 'current_user', None)
        if not current_user or getattr(current_user, 'role', None) != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin access required'
            }), 403
        
        session = get_db_session()
        
        # Find the requirement by request_id
        requirement = session.query(Requirement).filter_by(
            request_id=request_id,
            is_deleted=False
        ).first()
        
        if not requirement:
            return jsonify({
                'success': False,
                'message': f'Requirement with request_id {request_id} not found'
            }), 404
        
        # Get the status from request body (optional, defaults to True)
        data = request.get_json() or {}
        is_posted = data.get('is_job_posted', True)
        
        # Update the job posting status
        requirement.is_job_posted = is_posted
        if is_posted:
            requirement.job_posted_at = datetime.utcnow()
        else:
            requirement.job_posted_at = None
        
        requirement.updated_at = datetime.utcnow()
        
        session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Job posting status updated successfully',
            'data': {
                'request_id': requirement.request_id,
                'is_job_posted': requirement.is_job_posted,
                'job_posted_at': requirement.job_posted_at.isoformat() if requirement.job_posted_at else None
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error updating job posting status: {str(e)}")
        session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating job posting status: {str(e)}'
        }), 500


@job_posting_bp.route('/api/job-posting/requirements', methods=['GET'])
@require_domain_auth
def get_requirements_with_posting_status():
    """
    Get all requirements with their job posting status.
    Returns requirements sorted by created_at (newest first).
    """
    try:
        # Check admin role
        current_user = getattr(request, 'current_user', None)
        if not current_user or getattr(current_user, 'role', None) != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin access required'
            }), 403
        
        session = get_db_session()
        
        # Get all non-deleted requirements
        requirements = session.query(Requirement).filter_by(
            is_deleted=False
        ).order_by(Requirement.created_at.desc()).all()
        
        # Format the response
        requirements_data = []
        for req in requirements:
            # Get assigned recruiters with their emails
            assigned_recruiters = _get_assigned_recruiters_for_requirement(req.requirement_id, session)
            
            requirements_data.append({
                'request_id': req.request_id,
                'job_title': req.job_title,
                'job_description': req.job_description,
                'company_name': req.company_name,
                'is_job_posted': req.is_job_posted,
                'job_posted_at': req.job_posted_at.isoformat() if req.job_posted_at else None,
                'created_at': req.created_at.isoformat() if req.created_at else None,
                'assigned_recruiters': assigned_recruiters
            })
        
        return jsonify({
            'success': True,
            'data': requirements_data
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching requirements: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error fetching requirements: {str(e)}'
        }), 500

