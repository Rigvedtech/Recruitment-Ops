from flask import Blueprint, jsonify, request, current_app, g
from app.database import db
from app.models.source_cost_template import SourceCostTemplate
from app.models.profile import Profile, SourceEnum
from app.models.user import User, UserRoleEnum
from app.middleware.domain_auth import require_domain_auth
from sqlalchemy import func, and_
from datetime import datetime
from decimal import Decimal

costing_bp = Blueprint('costing', __name__)

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
        except Exception as e:
            current_app.logger.error(f"Error getting db.session: {str(e)}")
            raise
    except Exception as e:
        current_app.logger.error(f"Error in get_db_session: {str(e)}")
        # Last resort: return db.session directly
        return db.session

@costing_bp.route('/api/costing/source-templates', methods=['GET'])
@require_domain_auth
def get_source_templates():
    """Get all source cost templates"""
    try:
        # Check admin role
        current_user = getattr(request, 'current_user', None)
        if not current_user or getattr(getattr(current_user, 'role', None), 'value', None) != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin access required'
            }), 403
        
        session = get_db_session()
        templates = session.query(SourceCostTemplate).all()
        
        # If no templates exist, create default ones
        if not templates:
            for source in SourceEnum:
                template = SourceCostTemplate(
                    source=source,
                    cost=0.0
                )
                session.add(template)
            session.commit()
            templates = session.query(SourceCostTemplate).all()
        
        return jsonify({
            'success': True,
            'data': [template.to_dict() for template in templates]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching source templates: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error fetching source templates: {str(e)}'
        }), 500

@costing_bp.route('/api/costing/source-templates', methods=['PUT'])
@require_domain_auth
def update_source_templates():
    """Update source cost templates"""
    try:
        # Check admin role
        current_user = getattr(request, 'current_user', None)
        if not current_user or getattr(getattr(current_user, 'role', None), 'value', None) != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin access required'
            }), 403
        
        data = request.get_json()
        templates = data.get('templates', [])
        user_id = current_user.user_id
        
        if not templates:
            return jsonify({
                'success': False,
                'message': 'No templates provided'
            }), 400
        
        session = get_db_session()
        
        for template_data in templates:
            source_value = template_data.get('source')
            cost = template_data.get('cost', 0.0)
            
            # Convert string to enum
            try:
                source_enum = SourceEnum[source_value] if isinstance(source_value, str) else source_value
            except KeyError:
                source_enum = SourceEnum(source_value)
            
            # Find or create template
            template = session.query(SourceCostTemplate).filter_by(source=source_enum).first()
            
            if template:
                template.cost = cost
                template.updated_by = user_id
                template.updated_at = datetime.utcnow()
            else:
                template = SourceCostTemplate(
                    source=source_enum,
                    cost=cost,
                    updated_by=user_id
                )
                session.add(template)
        
        session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Source templates updated successfully'
        }), 200
        
    except Exception as e:
        session.rollback()
        current_app.logger.error(f"Error updating source templates: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error updating source templates: {str(e)}'
        }), 500

@costing_bp.route('/api/costing/recruiters', methods=['GET'])
@require_domain_auth
def get_recruiters():
    """Get list of active recruiters"""
    try:
        # Check admin role
        current_user = getattr(request, 'current_user', None)
        if not current_user or getattr(getattr(current_user, 'role', None), 'value', None) != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin access required'
            }), 403
        
        session = get_db_session()
        recruiters = session.query(User).filter(
            and_(
                User.role == UserRoleEnum.recruiter,
                User.is_deleted == False
            )
        ).all()
        
        return jsonify({
            'success': True,
            'data': [{
                'user_id': str(recruiter.user_id),
                'username': recruiter.username,
                'full_name': recruiter.full_name,
                'email': recruiter.email
            } for recruiter in recruiters]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching recruiters: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error fetching recruiters: {str(e)}'
        }), 500

@costing_bp.route('/api/costing/per-unit-calculate', methods=['POST'])
@require_domain_auth
def calculate_per_unit():
    """Calculate per unit cost for a specific recruiter"""
    try:
        # Check admin role
        current_user = getattr(request, 'current_user', None)
        if not current_user or getattr(getattr(current_user, 'role', None), 'value', None) != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin access required'
            }), 403
        
        data = request.get_json()
        recruiter_id = data.get('recruiter_id')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        source_cost = Decimal(str(data.get('source_cost', 0)))
        recruiter_salary = Decimal(str(data.get('recruiter_salary', 0)))
        infra_cost = Decimal(str(data.get('infra_cost', 0)))
        custom_costs = data.get('custom_costs', [])
        
        if not recruiter_id or not start_date or not end_date:
            return jsonify({
                'success': False,
                'message': 'Missing required parameters'
            }), 400
        
        session = get_db_session()
        
        # Parse dates
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Count profiles created by recruiter in date range
        profile_count = session.query(func.count(Profile.profile_id)).filter(
            and_(
                Profile.created_by_recruiter == recruiter_id,
                Profile.created_at >= start_dt,
                Profile.created_at <= end_dt,
                Profile.is_deleted == False
            )
        ).scalar()
        
        # Calculate costs
        profile_source_cost = Decimal(profile_count) * source_cost
        total_custom_cost = sum(Decimal(str(cost.get('amount', 0))) for cost in custom_costs)
        company_cost = profile_source_cost + infra_cost + total_custom_cost
        
        return jsonify({
            'success': True,
            'data': {
                'profile_count': profile_count,
                'source_cost': float(source_cost),
                'profile_source_cost': float(profile_source_cost),
                'infra_cost': float(infra_cost),
                'custom_costs': [{
                    'label': cost.get('label', ''),
                    'amount': float(cost.get('amount', 0))
                } for cost in custom_costs],
                'total_custom_cost': float(total_custom_cost),
                'company_cost': float(company_cost),
                'recruiter_salary': float(recruiter_salary)
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error calculating per unit cost: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error calculating per unit cost: {str(e)}'
        }), 500

@costing_bp.route('/api/costing/monthly-calculate', methods=['POST'])
@require_domain_auth
def calculate_monthly():
    """Calculate monthly cost for all profiles in date range"""
    try:
        # Check admin role
        current_user = getattr(request, 'current_user', None)
        if not current_user or getattr(getattr(current_user, 'role', None), 'value', None) != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin access required'
            }), 403
        
        data = request.get_json()
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        source_cost = Decimal(str(data.get('source_cost', 0)))
        recruiter_salary = Decimal(str(data.get('recruiter_salary', 0)))
        infra_cost = Decimal(str(data.get('infra_cost', 0)))
        custom_costs = data.get('custom_costs', [])
        
        if not start_date or not end_date:
            return jsonify({
                'success': False,
                'message': 'Missing required parameters'
            }), 400
        
        session = get_db_session()
        
        # Parse dates
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Count all profiles in date range
        profile_count = session.query(func.count(Profile.profile_id)).filter(
            and_(
                Profile.created_at >= start_dt,
                Profile.created_at <= end_dt,
                Profile.is_deleted == False
            )
        ).scalar()
        
        # Calculate costs
        profile_source_cost = Decimal(profile_count) * source_cost
        total_custom_cost = sum(Decimal(str(cost.get('amount', 0))) for cost in custom_costs)
        company_cost = profile_source_cost + infra_cost + total_custom_cost
        
        return jsonify({
            'success': True,
            'data': {
                'profile_count': profile_count,
                'source_cost': float(source_cost),
                'profile_source_cost': float(profile_source_cost),
                'infra_cost': float(infra_cost),
                'custom_costs': [{
                    'label': cost.get('label', ''),
                    'amount': float(cost.get('amount', 0))
                } for cost in custom_costs],
                'total_custom_cost': float(total_custom_cost),
                'company_cost': float(company_cost),
                'recruiter_salary': float(recruiter_salary)
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error calculating monthly cost: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error calculating monthly cost: {str(e)}'
        }), 500

@costing_bp.route('/api/costing/profile-count', methods=['POST'])
@require_domain_auth
def get_profile_count():
    """Get profile count for given parameters"""
    try:
        # Check admin role
        current_user = getattr(request, 'current_user', None)
        if not current_user or getattr(getattr(current_user, 'role', None), 'value', None) != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin access required'
            }), 403
        
        data = request.get_json()
        recruiter_id = data.get('recruiter_id')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        
        if not start_date or not end_date:
            return jsonify({
                'success': False,
                'message': 'Missing required parameters'
            }), 400
        
        session = get_db_session()
        
        # Parse dates
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Build query
        query = session.query(func.count(Profile.profile_id)).filter(
            and_(
                Profile.created_at >= start_dt,
                Profile.created_at <= end_dt,
                Profile.is_deleted == False
            )
        )
        
        # Add recruiter filter if provided
        if recruiter_id:
            query = query.filter(Profile.created_by_recruiter == recruiter_id)
        
        profile_count = query.scalar()
        
        return jsonify({
            'success': True,
            'data': {
                'profile_count': profile_count
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching profile count: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error fetching profile count: {str(e)}'
        }), 500

