from flask import Blueprint, jsonify, current_app
from app.services.redis_service import redis_service, redis_cache_service, redis_session_service
from app.services.redis_domain_cache_service import enhanced_domain_cache_service
from app.middleware.redis_performance_middleware import redis_performance_middleware
from app.middleware.redis_auth_middleware import require_redis_domain_auth
import time

redis_health_bp = Blueprint('redis_health', __name__, url_prefix='/api/redis')

@redis_health_bp.route('/health', methods=['GET'])
def redis_health_check():
    """Check Redis service health and performance metrics"""
    try:
        start_time = time.time()
        
        # Basic Redis connectivity check
        redis_available = redis_service.is_available()
        
        health_data = {
            'redis_available': redis_available,
            'timestamp': time.time(),
            'response_time_ms': 0
        }
        
        if redis_available:
            # Test Redis operations
            test_key = 'health_check_test'
            test_value = {'test': True, 'timestamp': time.time()}
            
            # Test set/get operations
            set_success = redis_service.set(test_key, test_value, 10)
            get_success = redis_service.get(test_key) is not None
            delete_success = redis_service.delete(test_key)
            
            # Get cache statistics
            cache_stats = redis_performance_middleware.get_cache_stats()
            domain_cache_info = enhanced_domain_cache_service.get_cache_info()
            
            # Get session statistics
            session_pattern = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}*"
            session_keys = redis_service.get_keys_by_pattern(session_pattern)
            
            health_data.update({
                'operations': {
                    'set': set_success,
                    'get': get_success,
                    'delete': delete_success
                },
                'cache_stats': cache_stats,
                'domain_cache_info': domain_cache_info,
                'active_sessions': len(session_keys),
                'redis_info': {
                    'connection_pool_size': redis_service.connection_pool.max_connections if redis_service.connection_pool else 0,
                    'redis_url': current_app.config.get('REDIS_URL', 'Not configured')
                }
            })
        else:
            health_data['error'] = 'Redis service not available'
        
        # Calculate response time
        health_data['response_time_ms'] = round((time.time() - start_time) * 1000, 2)
        
        return jsonify({
            'status': 'success',
            'data': health_data
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Health check failed: {str(e)}'
        }), 500

@redis_health_bp.route('/stats', methods=['GET'])
def redis_stats():
    """Get detailed Redis statistics and performance metrics"""
    try:
        if not redis_service.is_available():
            return jsonify({
                'status': 'error',
                'message': 'Redis service not available'
            }), 503
        
        # Get comprehensive statistics
        stats = {
            'timestamp': time.time(),
            'redis_connection': {
                'available': True,
                'url': current_app.config.get('REDIS_URL', 'Not configured'),
                'pool_size': redis_service.connection_pool.max_connections if redis_service.connection_pool else 0
            },
            'cache_performance': redis_performance_middleware.get_cache_stats(),
            'domain_cache': enhanced_domain_cache_service.get_cache_info(),
            'session_stats': {
                'prefix': current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:'),
                'active_sessions': len(redis_service.get_keys_by_pattern(f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}*"))
            },
            'credentials_cache': {
                'prefix': current_app.config.get('REDIS_DOMAIN_CREDENTIALS_PREFIX', 'domain_creds:'),
                'cached_domains': len(redis_service.get_keys_by_pattern(f"{current_app.config.get('REDIS_DOMAIN_CREDENTIALS_PREFIX', 'domain_creds:')}*"))
            },
            'api_cache': {
                'prefix': current_app.config.get('REDIS_API_CACHE_PREFIX', 'api_cache:'),
                'cached_responses': len(redis_service.get_keys_by_pattern(f"{current_app.config.get('REDIS_API_CACHE_PREFIX', 'api_cache:')}*"))
            },
            'rate_limits': {
                'prefix': current_app.config.get('REDIS_RATE_LIMIT_PREFIX', 'rate_limit:'),
                'active_limits': len(redis_service.get_keys_by_pattern(f"{current_app.config.get('REDIS_RATE_LIMIT_PREFIX', 'rate_limit:')}*"))
            }
        }
        
        return jsonify({
            'status': 'success',
            'data': stats
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to get Redis stats: {str(e)}'
        }), 500

@redis_health_bp.route('/cache/clear', methods=['POST'])
def clear_redis_caches():
    """Clear all Redis caches"""
    try:
        if not redis_service.is_available():
            return jsonify({
                'status': 'error',
                'message': 'Redis service not available'
            }), 503
        
        cleared_data = {
            'timestamp': time.time(),
            'cleared_caches': {}
        }
        
        # Clear different cache types
        cache_patterns = {
            'api_cache': f"{current_app.config.get('REDIS_API_CACHE_PREFIX', 'api_cache:')}*",
            'domain_credentials': f"{current_app.config.get('REDIS_DOMAIN_CREDENTIALS_PREFIX', 'domain_creds:')}*",
            'user_sessions': f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}*",
            'rate_limits': f"{current_app.config.get('REDIS_RATE_LIMIT_PREFIX', 'rate_limit:')}*",
            'query_cache': "db_query:*"
        }
        
        for cache_type, pattern in cache_patterns.items():
            cleared_count = redis_service.clear_pattern(pattern)
            cleared_data['cleared_caches'][cache_type] = cleared_count
        
        # Clear performance middleware caches
        performance_cleared = redis_performance_middleware.clear_all_caches()
        cleared_data['performance_caches_cleared'] = performance_cleared
        
        # Clear domain cache service
        enhanced_domain_cache_service.clear_all_cache()
        cleared_data['domain_cache_cleared'] = True
        
        return jsonify({
            'status': 'success',
            'data': cleared_data
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to clear caches: {str(e)}'
        }), 500

@redis_health_bp.route('/cache/invalidate/<domain>', methods=['POST'])
def invalidate_domain_cache(domain):
    """Invalidate cache for a specific domain"""
    try:
        if not redis_service.is_available():
            return jsonify({
                'status': 'error',
                'message': 'Redis service not available'
            }), 503
        
        # Invalidate domain credentials cache
        credentials_invalidated = enhanced_domain_cache_service.invalidate_domain(domain)
        
        # Invalidate domain-specific API caches
        api_cache_pattern = f"{current_app.config.get('REDIS_API_CACHE_PREFIX', 'api_cache:')}*{domain}*"
        api_cache_cleared = redis_service.clear_pattern(api_cache_pattern)
        
        # Invalidate domain-specific user sessions
        session_pattern = f"{current_app.config.get('REDIS_USER_SESSION_PREFIX', 'user_session:')}{domain}:*"
        session_cleared = redis_service.clear_pattern(session_pattern)
        
        return jsonify({
            'status': 'success',
            'data': {
                'domain': domain,
                'timestamp': time.time(),
                'credentials_invalidated': credentials_invalidated,
                'api_cache_cleared': api_cache_cleared,
                'sessions_cleared': session_cleared
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to invalidate cache for domain {domain}: {str(e)}'
        }), 500

@redis_health_bp.route('/sessions/<domain>/<user_id>', methods=['DELETE'])
def invalidate_user_sessions(domain, user_id):
    """Invalidate all sessions for a specific user in a domain"""
    try:
        if not redis_service.is_available():
            return jsonify({
                'status': 'error',
                'message': 'Redis service not available'
            }), 503
        
        # Destroy user sessions
        destroyed_count = redis_session_service.destroy_user_sessions(user_id, domain)
        
        return jsonify({
            'status': 'success',
            'data': {
                'domain': domain,
                'user_id': user_id,
                'sessions_destroyed': destroyed_count,
                'timestamp': time.time()
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to invalidate sessions for user {user_id} in domain {domain}: {str(e)}'
        }), 500

@redis_health_bp.route('/performance/test', methods=['GET'])
def redis_performance_test():
    """Run Redis performance tests"""
    try:
        if not redis_service.is_available():
            return jsonify({
                'status': 'error',
                'message': 'Redis service not available'
            }), 503
        
        test_results = {
            'timestamp': time.time(),
            'tests': {}
        }
        
        # Test 1: Set/Get operations
        test_key = 'perf_test'
        test_value = {'data': 'test' * 1000}  # Larger payload
        
        start_time = time.time()
        set_success = redis_service.set(test_key, test_value, 60)
        set_time = time.time() - start_time
        
        start_time = time.time()
        get_value = redis_service.get(test_key)
        get_time = time.time() - start_time
        
        redis_service.delete(test_key)
        
        test_results['tests']['set_get_operations'] = {
            'set_success': set_success,
            'get_success': get_value is not None,
            'set_time_ms': round(set_time * 1000, 2),
            'get_time_ms': round(get_time * 1000, 2)
        }
        
        # Test 2: Batch operations
        batch_keys = [f'batch_test_{i}' for i in range(10)]
        batch_values = [{'index': i, 'data': f'test_data_{i}'} for i in range(10)]
        
        start_time = time.time()
        batch_set_success = []
        for key, value in zip(batch_keys, batch_values):
            batch_set_success.append(redis_service.set(key, value, 60))
        
        batch_set_time = time.time() - start_time
        
        start_time = time.time()
        batch_get_success = []
        for key in batch_keys:
            batch_get_success.append(redis_service.get(key) is not None)
        
        batch_get_time = time.time() - start_time
        
        # Cleanup
        for key in batch_keys:
            redis_service.delete(key)
        
        test_results['tests']['batch_operations'] = {
            'batch_size': len(batch_keys),
            'set_success_rate': sum(batch_set_success) / len(batch_set_success),
            'get_success_rate': sum(batch_get_success) / len(batch_get_success),
            'batch_set_time_ms': round(batch_set_time * 1000, 2),
            'batch_get_time_ms': round(batch_get_time * 1000, 2)
        }
        
        return jsonify({
            'status': 'success',
            'data': test_results
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Performance test failed: {str(e)}'
        }), 500


