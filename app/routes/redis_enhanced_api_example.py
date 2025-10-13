"""
Example API routes demonstrating Redis-enhanced middleware usage

This file shows how to integrate Redis caching, session management,
and performance optimization into existing API endpoints.
"""

from flask import Blueprint, jsonify, request
from app.middleware.redis_auth_middleware import (
    require_redis_domain_auth, 
    require_jwt_redis_domain_auth,
    require_redis_domain_role,
    get_current_redis_session
)
from app.middleware.redis_performance_middleware import (
    cache_response,
    cache_database_query,
    invalidate_cache_pattern,
    rate_limit
)
from app.services.redis_service import redis_cache_service
import time

redis_enhanced_bp = Blueprint('redis_enhanced', __name__, url_prefix='/api/redis-enhanced')

# Example 1: Basic Redis-authenticated endpoint with caching
@redis_enhanced_bp.route('/profiles', methods=['GET'])
@require_redis_domain_auth
@cache_response(ttl=1800)  # Cache for 30 minutes
@rate_limit(requests_per_minute=100)
def get_profiles():
    """Get profiles with Redis authentication and caching"""
    try:
        # Simulate database query (would normally query your database)
        profiles = [
            {'id': 1, 'name': 'John Doe', 'role': 'Developer'},
            {'id': 2, 'name': 'Jane Smith', 'role': 'Manager'}
        ]
        
        return jsonify({
            'status': 'success',
            'data': profiles,
            'session_id': get_current_redis_session(),
            'timestamp': time.time()
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to get profiles: {str(e)}'
        }), 500

# Example 2: JWT-authenticated endpoint with role-based access
@redis_enhanced_bp.route('/admin/users', methods=['GET'])
@require_jwt_redis_domain_auth
@require_redis_domain_role(['admin'])
@cache_response(ttl=900)  # Cache for 15 minutes
def get_admin_users():
    """Get users list (admin only) with JWT and Redis authentication"""
    try:
        # Simulate admin-only data
        users = [
            {'id': 1, 'username': 'admin', 'role': 'admin'},
            {'id': 2, 'username': 'recruiter1', 'role': 'recruiter'}
        ]
        
        return jsonify({
            'status': 'success',
            'data': users,
            'cached_at': time.time()
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to get users: {str(e)}'
        }), 500

# Example 3: Database query caching
def expensive_database_query(user_id: int):
    """Simulate an expensive database query"""
    time.sleep(0.1)  # Simulate query time
    return {
        'user_id': user_id,
        'data': f'Expensive query result for user {user_id}',
        'computed_at': time.time()
    }

@cache_database_query(ttl=3600)  # Cache query results for 1 hour
def cached_expensive_query(user_id: int):
    """Cached version of expensive database query"""
    return expensive_database_query(user_id)

@redis_enhanced_bp.route('/user/<int:user_id>/details', methods=['GET'])
@require_redis_domain_auth
def get_user_details(user_id):
    """Get user details with cached database query"""
    try:
        # Use cached database query
        user_details = cached_expensive_query(user_id)
        
        return jsonify({
            'status': 'success',
            'data': user_details
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to get user details: {str(e)}'
        }), 500

# Example 4: Cache invalidation on data modification
@redis_enhanced_bp.route('/profiles/<int:profile_id>', methods=['PUT'])
@require_redis_domain_auth
@invalidate_cache_pattern('api_cache:get_profiles*')  # Invalidate profiles cache
def update_profile(profile_id):
    """Update profile and invalidate related caches"""
    try:
        data = request.get_json()
        
        # Simulate profile update
        updated_profile = {
            'id': profile_id,
            'name': data.get('name', 'Unknown'),
            'role': data.get('role', 'User'),
            'updated_at': time.time()
        }
        
        return jsonify({
            'status': 'success',
            'data': updated_profile,
            'message': 'Profile updated and cache invalidated'
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to update profile: {str(e)}'
        }), 500

# Example 5: Custom rate limiting
def custom_rate_limit_key(req):
    """Custom rate limiting based on user ID"""
    return f"user:{req.current_user.id}:{req.path}"

@redis_enhanced_bp.route('/heavy-operation', methods=['POST'])
@require_redis_domain_auth
@rate_limit(requests_per_minute=10, key_func=custom_rate_limit_key)
def heavy_operation():
    """Heavy operation with custom rate limiting per user"""
    try:
        # Simulate heavy operation
        time.sleep(0.5)
        
        return jsonify({
            'status': 'success',
            'message': 'Heavy operation completed',
            'user_id': request.current_user.id,
            'completed_at': time.time()
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Heavy operation failed: {str(e)}'
        }), 500

# Example 6: Session management
@redis_enhanced_bp.route('/session/info', methods=['GET'])
@require_redis_domain_auth
def get_session_info():
    """Get current session information"""
    try:
        session_id = get_current_redis_session()
        user = request.current_user
        domain = request.current_domain
        
        return jsonify({
            'status': 'success',
            'data': {
                'session_id': session_id,
                'user_id': user.id if hasattr(user, 'id') else user.get('user_id'),
                'username': user.username if hasattr(user, 'username') else user.get('username'),
                'domain': domain,
                'authenticated_at': time.time()
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to get session info: {str(e)}'
        }), 500

@redis_enhanced_bp.route('/session/logout', methods=['POST'])
@require_redis_domain_auth
def logout():
    """Logout and invalidate current session"""
    try:
        from app.middleware.redis_auth_middleware import invalidate_current_session
        
        session_id = get_current_redis_session()
        invalidated = invalidate_current_session()
        
        return jsonify({
            'status': 'success',
            'message': 'Logged out successfully',
            'session_invalidated': invalidated,
            'session_id': session_id
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Logout failed: {str(e)}'
        }), 500

# Example 7: API response with custom caching
@redis_enhanced_bp.route('/analytics/dashboard', methods=['GET'])
@require_redis_domain_auth
@require_redis_domain_role(['admin', 'recruiter'])
@cache_response(ttl=300, key_prefix='analytics')  # Cache for 5 minutes with custom prefix
def get_analytics_dashboard():
    """Get analytics dashboard with custom caching"""
    try:
        # Simulate analytics data
        dashboard_data = {
            'total_profiles': 150,
            'active_recruiters': 25,
            'pending_interviews': 12,
            'completed_this_week': 8,
            'generated_at': time.time()
        }
        
        return jsonify({
            'status': 'success',
            'data': dashboard_data
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to get analytics: {str(e)}'
        }), 500

# Example 8: Conditional caching based on request parameters
@redis_enhanced_bp.route('/search', methods=['GET'])
@require_redis_domain_auth
def search_with_conditional_caching():
    """Search with conditional caching based on query parameters"""
    try:
        query = request.args.get('q', '')
        limit = int(request.args.get('limit', 10))
        
        # Only cache if query is not empty and limit is reasonable
        if query and limit <= 50:
            # Use cache_response decorator conditionally
            cache_ttl = 600  # 10 minutes for search results
        else:
            cache_ttl = None  # Don't cache empty queries or large limits
        
        # Simulate search
        results = [
            {'id': i, 'title': f'Result {i} for "{query}"', 'relevance': 0.9 - i*0.1}
            for i in range(min(limit, 10))
        ]
        
        response_data = {
            'query': query,
            'results': results,
            'total': len(results),
            'cached': cache_ttl is not None
        }
        
        # Manually cache if needed
        if cache_ttl:
            from app.middleware.redis_performance_middleware import redis_performance_middleware
            redis_performance_middleware._generate_cache_key(
                search_with_conditional_caching, request
            )
            redis_cache_service.cache_api_response(
                request.path,
                {'q': query, 'limit': limit},
                response_data,
                cache_ttl
            )
        
        return jsonify({
            'status': 'success',
            'data': response_data
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Search failed: {str(e)}'
        }), 500


