#!/usr/bin/env python3
"""
Redis Integration Demo

This script demonstrates the Redis integration features and shows
how to use them in your application.
"""

import os
import sys
from flask import Flask, jsonify

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

def demo_redis_integration():
    """Demonstrate Redis integration features"""
    print("🚀 Redis Integration Demo")
    print("=" * 60)
    
    try:
        # Create Flask app with Redis integration
        from app import create_app
        app = create_app()
        
        print("✅ Application created successfully with Redis integration!")
        
        # Demo 1: Show available Redis endpoints
        print("\n📡 Available Redis Health Endpoints:")
        redis_endpoints = [
            "GET /api/redis/health - Check Redis service health",
            "GET /api/redis/stats - Get detailed Redis statistics", 
            "POST /api/redis/cache/clear - Clear all Redis caches",
            "POST /api/redis/cache/invalidate/<domain> - Invalidate domain cache",
            "DELETE /api/redis/sessions/<domain>/<user_id> - Invalidate user sessions",
            "GET /api/redis/performance/test - Run performance tests"
        ]
        
        for endpoint in redis_endpoints:
            print(f"  • {endpoint}")
        
        # Demo 2: Show Redis middleware decorators
        print("\n🔧 Available Redis Middleware Decorators:")
        decorators = [
            "@require_redis_domain_auth - Redis-based domain authentication",
            "@require_jwt_redis_domain_auth - JWT + Redis authentication", 
            "@require_redis_domain_role(['admin']) - Role-based access with Redis",
            "@cache_response(ttl=1800) - Cache API responses for 30 minutes",
            "@cache_database_query(ttl=3600) - Cache database query results",
            "@rate_limit(requests_per_minute=100) - Rate limiting with Redis",
            "@invalidate_cache_pattern('api_cache:*') - Invalidate cache patterns"
        ]
        
        for decorator in decorators:
            print(f"  • {decorator}")
        
        # Demo 3: Show configuration
        print("\n⚙️ Redis Configuration:")
        config_items = [
            f"REDIS_HOST: {app.config.get('REDIS_HOST', 'localhost')}",
            f"REDIS_PORT: {app.config.get('REDIS_PORT', 6379)}",
            f"REDIS_DB: {app.config.get('REDIS_DB', 0)}",
            f"REDIS_CACHE_TTL: {app.config.get('REDIS_CACHE_TTL', 3600)} seconds",
            f"REDIS_SESSION_TTL: {app.config.get('REDIS_SESSION_TTL', 86400)} seconds"
        ]
        
        for config in config_items:
            print(f"  • {config}")
        
        # Demo 4: Test Redis service status
        print("\n🔍 Redis Service Status:")
        from app.services.redis_service import redis_service
        redis_available = redis_service.is_available()
        print(f"  • Redis Server Available: {'✅ Yes' if redis_available else '❌ No (using fallback)'}")
        
        if not redis_available:
            print("  • Fallback Mode: In-memory caching is active")
            print("  • All features work, but without Redis performance benefits")
        
        # Demo 5: Show cache service status
        print("\n💾 Cache Service Status:")
        from app.services.redis_domain_cache_service import enhanced_domain_cache_service
        cache_info = enhanced_domain_cache_service.get_cache_info()
        print(f"  • Redis Cache: {'✅ Active' if cache_info.get('redis_available') else '❌ Inactive'}")
        print(f"  • Memory Cache: ✅ Active ({cache_info.get('memory_cache', {}).get('total_entries', 0)} entries)")
        
        print("\n" + "=" * 60)
        print("🎉 Redis Integration Demo Complete!")
        
        if not redis_available:
            print("\n💡 To get full Redis benefits:")
            print("1. Install Redis server (see REDIS_INTEGRATION_GUIDE.md)")
            print("2. Start Redis server")
            print("3. Restart your application")
            print("4. Monitor performance improvements!")
        
        print("\n📚 Next Steps:")
        print("• Review REDIS_INTEGRATION_GUIDE.md for detailed usage")
        print("• Check app/routes/redis_enhanced_api_example.py for examples")
        print("• Use the Redis health endpoints to monitor performance")
        print("• Gradually migrate existing endpoints to use Redis decorators")
        
        return True
        
    except Exception as e:
        print(f"❌ Demo failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = demo_redis_integration()
    sys.exit(0 if success else 1)


