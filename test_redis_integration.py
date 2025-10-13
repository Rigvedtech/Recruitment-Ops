#!/usr/bin/env python3
"""
Redis Integration Test Script

This script tests the Redis integration components to ensure they work correctly.
Run this script after setting up Redis to verify the integration.
"""

import os
import sys
import time
import json
from typing import Optional
from flask import Flask

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

def test_redis_service():
    """Test basic Redis service functionality"""
    print("Testing Redis Service...")
    
    try:
        from app.services.redis_service import redis_service
        
        # Initialize with test app
        app = Flask(__name__)
        app.config['REDIS_HOST'] = os.getenv('REDIS_HOST', 'localhost')
        app.config['REDIS_PORT'] = int(os.getenv('REDIS_PORT', '6379'))
        app.config['REDIS_PASSWORD'] = os.getenv('REDIS_PASSWORD')
        app.config['REDIS_DB'] = int(os.getenv('REDIS_DB', '0'))
        
        redis_service.init_app(app)
        
        if redis_service.is_available():
            print("✓ Redis service is available")
            
            # Test basic operations
            test_key = 'test_key'
            test_value = {'test': 'data', 'timestamp': time.time()}
            
            # Test set
            if redis_service.set(test_key, test_value, 60):
                print("✓ Redis set operation successful")
            else:
                print("✗ Redis set operation failed")
                return False
            
            # Test get
            retrieved_value = redis_service.get(test_key)
            if retrieved_value and retrieved_value.get('test') == 'data':
                print("✓ Redis get operation successful")
            else:
                print("✗ Redis get operation failed")
                return False
            
            # Test delete
            if redis_service.delete(test_key):
                print("✓ Redis delete operation successful")
            else:
                print("✗ Redis delete operation failed")
                return False
            
            return True
        else:
            print("✗ Redis service is not available")
            return False
            
    except Exception as e:
        print(f"✗ Redis service test failed: {str(e)}")
        return False

def test_cache_service():
    """Test Redis cache service functionality"""
    print("\nTesting Redis Cache Service...")
    
    try:
        from app.services.redis_service import redis_cache_service
        from app.services.redis_service import redis_service
        
        if not redis_service.is_available():
            print("✗ Redis not available, skipping cache service test")
            return False
        
        # Test domain credentials caching
        test_domain = 'test.example.com'
        test_credentials = {
            'POSTGRES_HOST': 'localhost',
            'POSTGRES_PORT': '5432',
            'POSTGRES_DB': 'test_db',
            'POSTGRES_USER': 'test_user',
            'POSTGRES_PASSWORD': 'test_pass'
        }
        
        # Cache credentials
        if redis_cache_service.cache_domain_credentials(test_domain, test_credentials, 60):
            print("✓ Domain credentials caching successful")
        else:
            print("✗ Domain credentials caching failed")
            return False
        
        # Retrieve credentials
        cached_creds = redis_cache_service.get_domain_credentials(test_domain)
        if cached_creds and cached_creds.get('POSTGRES_HOST') == 'localhost':
            print("✓ Domain credentials retrieval successful")
        else:
            print("✗ Domain credentials retrieval failed")
            return False
        
        # Invalidate credentials
        if redis_cache_service.invalidate_domain_credentials(test_domain):
            print("✓ Domain credentials invalidation successful")
        else:
            print("✗ Domain credentials invalidation failed")
            return False
        
        return True
        
    except Exception as e:
        print(f"✗ Cache service test failed: {str(e)}")
        return False

def test_session_service():
    """Test Redis session service functionality"""
    print("\nTesting Redis Session Service...")
    
    try:
        from app.services.redis_service import redis_session_service
        from app.services.redis_service import redis_service
        
        if not redis_service.is_available():
            print("✗ Redis not available, skipping session service test")
            return False
        
        # Test session creation
        test_user_id = 'test_user_123'
        test_domain = 'test.example.com'
        test_session_data = {
            'user_id': test_user_id,
            'username': 'testuser',
            'role': 'admin',
            'domain': test_domain,
            'created_at': time.time()
        }
        
        session_id = redis_session_service.create_session(test_user_id, test_domain, test_session_data)
        if session_id:
            print("✓ Session creation successful")
        else:
            print("✗ Session creation failed")
            return False
        
        # Test session retrieval
        retrieved_session = redis_session_service.get_session(session_id, test_domain)
        if retrieved_session and retrieved_session.get('data', {}).get('username') == 'testuser':
            print("✓ Session retrieval successful")
        else:
            print("✗ Session retrieval failed")
            return False
        
        # Test session update
        updated_data = {'last_accessed': time.time()}
        if redis_session_service.update_session(session_id, test_domain, updated_data):
            print("✓ Session update successful")
        else:
            print("✗ Session update failed")
            return False
        
        # Test session destruction
        if redis_session_service.destroy_session(session_id, test_domain):
            print("✓ Session destruction successful")
        else:
            print("✗ Session destruction failed")
            return False
        
        return True
        
    except Exception as e:
        print(f"✗ Session service test failed: {str(e)}")
        return False

def test_domain_cache_service():
    """Test enhanced domain cache service functionality"""
    print("\nTesting Enhanced Domain Cache Service...")
    
    try:
        from app.services.redis_domain_cache_service import enhanced_domain_cache_service
        from app.services.redis_service import redis_service
        
        if not redis_service.is_available():
            print("✗ Redis not available, using fallback cache")
        
        # Test domain credentials caching
        test_domain = 'test.enhanced.com'
        test_credentials = {
            'POSTGRES_HOST': 'localhost',
            'POSTGRES_PORT': '5432',
            'POSTGRES_DB': 'enhanced_db',
            'POSTGRES_USER': 'enhanced_user',
            'POSTGRES_PASSWORD': 'enhanced_pass'
        }
        
        # Cache credentials
        enhanced_domain_cache_service.cache_credentials(test_domain, test_credentials, 60)
        print("✓ Enhanced domain cache credentials cached")
        
        # Retrieve credentials
        cached_creds = enhanced_domain_cache_service.get_credentials(test_domain)
        if cached_creds and cached_creds.get('POSTGRES_HOST') == 'localhost':
            print("✓ Enhanced domain cache credentials retrieved")
        else:
            print("✗ Enhanced domain cache credentials retrieval failed")
            return False
        
        # Test cache info
        cache_info = enhanced_domain_cache_service.get_cache_info()
        if cache_info:
            print("✓ Enhanced domain cache info retrieved")
            print(f"  Redis available: {cache_info.get('redis_available', False)}")
        else:
            print("✗ Enhanced domain cache info retrieval failed")
            return False
        
        return True
        
    except Exception as e:
        print(f"✗ Enhanced domain cache service test failed: {str(e)}")
        return False

def test_performance_middleware():
    """Test Redis performance middleware functionality"""
    print("\nTesting Redis Performance Middleware...")
    
    try:
        from app.middleware.redis_performance_middleware import redis_performance_middleware
        from app.services.redis_service import redis_service
        
        if not redis_service.is_available():
            print("✗ Redis not available, skipping performance middleware test")
            return False
        
        # Test cache stats
        stats = redis_performance_middleware.get_cache_stats()
        if stats:
            print("✓ Performance middleware cache stats retrieved")
            print(f"  Redis available: {stats.get('redis_available', False)}")
        else:
            print("✗ Performance middleware cache stats retrieval failed")
            return False
        
        # Test rate limiting
        test_key = 'test_rate_limit'
        limit_result = redis_cache_service.rate_limit_check(test_key, 10, 60)
        if limit_result:
            print("✓ Rate limiting check successful")
            print(f"  Allowed: {limit_result.get('allowed', False)}")
            print(f"  Remaining: {limit_result.get('remaining', 0)}")
        else:
            print("✗ Rate limiting check failed")
            return False
        
        return True
        
    except Exception as e:
        print(f"✗ Performance middleware test failed: {str(e)}")
        return False

def main():
    """Run all Redis integration tests"""
    print("Redis Integration Test Suite")
    print("=" * 50)
    
    tests = [
        test_redis_service,
        test_cache_service,
        test_session_service,
        test_domain_cache_service,
        test_performance_middleware
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                print(f"Test {test.__name__} failed")
        except Exception as e:
            print(f"Test {test.__name__} failed with exception: {str(e)}")
    
    print("\n" + "=" * 50)
    print(f"Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All Redis integration tests passed!")
        return 0
    else:
        print("❌ Some tests failed. Please check Redis configuration and setup.")
        return 1

if __name__ == '__main__':
    sys.exit(main())
