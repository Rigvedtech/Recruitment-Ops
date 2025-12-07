from flask import Blueprint, jsonify, request, current_app, g
from app.models.requirement import Requirement
from app.models.user import User
from app.database import db
from app.middleware.domain_auth import require_domain_auth
from app.middleware.redis_performance_middleware import cache_response
from sqlalchemy import text

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

enum_bp = Blueprint('enum', __name__, url_prefix='/api/enum')

@enum_bp.route('/get-enum-values', methods=['GET'])
@require_domain_auth
@cache_response(ttl=3600)  # Cache for 1 hour (enum values rarely change)
def get_enum_values():
    """Get all enum values for a specific enum type"""
    try:
        enum_type = request.args.get('enum_type')
        
        if not enum_type:
            return jsonify({'error': 'enum_type parameter is required'}), 400
        
        # Validate enum type
        valid_enum_types = {
            'company': 'companyenum',
            'department': 'departmentenum', 
            'shift': 'shiftenum',
            'job_type': 'jobtypeenum',
            'priority': 'priorityenum',
            'source': 'sourceenum'
        }
        
        if enum_type not in valid_enum_types:
            return jsonify({'error': 'Invalid enum type'}), 400
        
        db_enum_type = valid_enum_types[enum_type]
        
        # Get all enum values
        query = text("""
            SELECT enumlabel 
            FROM pg_enum 
            WHERE enumtypid = (
                SELECT oid FROM pg_type WHERE typname = :enum_type
            ) 
            ORDER BY enumlabel
        """)
        
        result = get_db_session().execute(query, {'enum_type': db_enum_type}).fetchall()
        
        enum_values = [row[0] for row in result]
        
        return jsonify({
            'success': True,
            'enum_type': enum_type,
            'values': enum_values
        })
        
    except Exception as e:
        current_app.logger.error(f"Error getting enum values: {str(e)}")
        return jsonify({'error': f'Failed to get enum values: {str(e)}'}), 500

@enum_bp.route('/filter-values/status', methods=['GET'])
@require_domain_auth
@cache_response(ttl=3600)
def get_status_values():
    """Get all possible status values for filtering"""
    return jsonify({
        'success': True,
        'values': ['Open', 'Candidate_Submission', 'Interview_Scheduled', 
                   'Offer_Recommendation', 'On_Boarding', 'On_Hold', 'Closed']
    })

@enum_bp.route('/filter-values/location', methods=['GET'])
@require_domain_auth
@cache_response(ttl=3600)
def get_location_values():
    """Get all distinct location values from requirements (manual requirements only)"""
    try:
        locations = get_db_session().query(
            Requirement.location
        ).filter(
            Requirement.deleted_at.is_(None),
            Requirement.is_manual_requirement == True,
            Requirement.location.isnot(None),
            Requirement.location != ''
        ).distinct().order_by(Requirement.location).all()
        
        return jsonify({
            'success': True,
            'values': [loc[0] for loc in locations if loc[0]]
        })
    except Exception as e:
        current_app.logger.error(f"Error getting location values: {str(e)}")
        return jsonify({'error': f'Failed to get location values: {str(e)}'}), 500

@enum_bp.route('/filter-values/job-title', methods=['GET'])
@require_domain_auth
@cache_response(ttl=3600)
def get_job_title_values():
    """Get all distinct job title values from requirements (manual requirements only)"""
    try:
        job_titles = get_db_session().query(
            Requirement.job_title
        ).filter(
            Requirement.deleted_at.is_(None),
            Requirement.is_manual_requirement == True,
            Requirement.job_title.isnot(None),
            Requirement.job_title != ''
        ).distinct().order_by(Requirement.job_title).all()
        
        return jsonify({
            'success': True,
            'values': [title[0] for title in job_titles if title[0]]
        })
    except Exception as e:
        current_app.logger.error(f"Error getting job title values: {str(e)}")
        return jsonify({'error': f'Failed to get job title values: {str(e)}'}), 500

@enum_bp.route('/filter-values/recruiters', methods=['GET'])
@require_domain_auth
@cache_response(ttl=600)
def get_recruiter_values():
    """Get all recruiter usernames for filtering"""
    try:
        recruiters = get_db_session().query(User.username).filter(
            User.role == 'recruiter',
            User.is_deleted == False
        ).order_by(User.username).all()
        
        return jsonify({
            'success': True,
            'values': [r[0] for r in recruiters]
        })
    except Exception as e:
        current_app.logger.error(f"Error getting recruiter values: {str(e)}")
        return jsonify({'error': f'Failed to get recruiter values: {str(e)}'}), 500



