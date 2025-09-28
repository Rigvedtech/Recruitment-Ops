"""
Domain-aware database test API endpoints for verifying domain isolation works correctly.
"""

from flask import Blueprint, request, jsonify, g, current_app
import logging
from app.services.domain_aware_db import debug_session_info, is_using_domain_session, get_current_domain
from app.models.user import User
from app.models.profile import Profile
from app.models.requirement import Requirement
from app.database import db

def get_db_session():
    """
    Get the correct database session for the current domain.
    Returns domain-specific session if available, otherwise falls back to global session.
    """
    if hasattr(g, 'db_session') and g.db_session is not None:
        return g.db_session
    else:
        # Fallback to global session for backward compatibility
        return db.session

logger = logging.getLogger(__name__)

domain_test_bp = Blueprint('domain_test', __name__, url_prefix='/api/domain-test')

@domain_test_bp.route('/session-info', methods=['GET'])
def get_session_info():
    """
    Get information about current database session and domain routing.
    This endpoint helps verify that domain-aware routing is working correctly.
    """
    try:
        # Get debug information about current session
        session_info = debug_session_info()
        
        # Add additional context
        session_info.update({
            'request_domain_header': request.headers.get('X-Original-Domain'),
            'request_alt_domain_header': request.headers.get('X-Domain'),
            'request_host': request.headers.get('Host'),
            'request_path': request.path,
            'request_method': request.method
        })
        
        return jsonify({
            'success': True,
            'data': session_info,
            'message': 'Session information retrieved successfully'
        })
        
    except Exception as e:
        logger.error(f"Error getting session info: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@domain_test_bp.route('/test-query', methods=['GET'])
def test_domain_query():
    """
    Test that queries are being routed to the correct domain database.
    This endpoint performs sample queries and reports which database they're using.
    """
    try:
        # Get session information
        session_info = debug_session_info()
        
        # Test queries on different models
        test_results = {}
        
        # Test User query
        try:
            user_count = User.query.count()
            test_results['user_query'] = {
                'success': True,
                'count': user_count,
                'session_type': 'domain' if is_using_domain_session() else 'default'
            }
        except Exception as e:
            test_results['user_query'] = {
                'success': False,
                'error': str(e)
            }
        
        # Test Profile query
        try:
            profile_count = Profile.query.count()
            test_results['profile_query'] = {
                'success': True,
                'count': profile_count,
                'session_type': 'domain' if is_using_domain_session() else 'default'
            }
        except Exception as e:
            test_results['profile_query'] = {
                'success': False,
                'error': str(e)
            }
        
        # Test Requirement query
        try:
            requirement_count = Requirement.query.count()
            test_results['requirement_query'] = {
                'success': True,
                'count': requirement_count,
                'session_type': 'domain' if is_using_domain_session() else 'default'
            }
        except Exception as e:
            test_results['requirement_query'] = {
                'success': False,
                'error': str(e)
            }
        
        return jsonify({
            'success': True,
            'data': {
                'session_info': session_info,
                'test_results': test_results,
                'current_domain': get_current_domain(),
                'using_domain_session': is_using_domain_session()
            },
            'message': 'Domain query test completed'
        })
        
    except Exception as e:
        logger.error(f"Error testing domain query: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@domain_test_bp.route('/compare-sessions', methods=['GET'])
def compare_sessions():
    """
    Compare data counts between domain-specific and default sessions.
    This helps verify that different domains have different data.
    """
    try:
        from app.database import db
        
        results = {}
        
        # Get counts using domain-aware queries (automatic routing)
        results['domain_aware'] = {
            'users': User.query.count(),
            'profiles': Profile.query.count(),
            'requirements': Requirement.query.count(),
            'session_type': 'domain' if is_using_domain_session() else 'default',
            'current_domain': get_current_domain()
        }
        
        # Get counts using explicit default session
        results['default_session'] = {
            'users': get_db_session().query(User).count(),
            'profiles': get_db_session().query(Profile).count(),
            'requirements': get_db_session().query(Requirement).count(),
            'session_type': 'default'
        }
        
        # Compare the results
        results['comparison'] = {
            'users_match': results['domain_aware']['users'] == results['default_session']['users'],
            'profiles_match': results['domain_aware']['profiles'] == results['default_session']['profiles'],
            'requirements_match': results['domain_aware']['requirements'] == results['default_session']['requirements'],
            'using_different_databases': is_using_domain_session()
        }
        
        return jsonify({
            'success': True,
            'data': results,
            'message': 'Session comparison completed'
        })
        
    except Exception as e:
        logger.error(f"Error comparing sessions: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
