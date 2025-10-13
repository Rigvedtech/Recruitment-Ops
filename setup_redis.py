#!/usr/bin/env python3
"""
Redis Setup Script for Recruitment Operations

This script helps set up Redis for the recruitment operations middleware.
It provides installation instructions and configuration validation.
"""

import os
import sys
import subprocess
import platform

def check_redis_installation():
    """Check if Redis is installed and running"""
    print("Checking Redis installation...")
    
    try:
        # Check if redis-server command exists
        result = subprocess.run(['redis-server', '--version'], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✓ Redis server found: {result.stdout.strip()}")
            return True
        else:
            print("✗ Redis server not found")
            return False
    except FileNotFoundError:
        print("✗ Redis server not found in PATH")
        return False

def check_redis_running():
    """Check if Redis server is running"""
    print("Checking if Redis server is running...")
    
    try:
        result = subprocess.run(['redis-cli', 'ping'], 
                              capture_output=True, text=True)
        if result.returncode == 0 and 'PONG' in result.stdout:
            print("✓ Redis server is running and responding")
            return True
        else:
            print("✗ Redis server is not responding")
            return False
    except FileNotFoundError:
        print("✗ redis-cli not found")
        return False

def install_redis_instructions():
    """Provide Redis installation instructions"""
    system = platform.system().lower()
    
    print("\nRedis Installation Instructions:")
    print("=" * 50)
    
    if system == 'windows':
        print("Windows:")
        print("1. Download Redis for Windows from: https://github.com/microsoftarchive/redis/releases")
        print("2. Extract and run redis-server.exe")
        print("3. Or use Chocolatey: choco install redis-64")
        print("4. Or use WSL (Windows Subsystem for Linux)")
        
    elif system == 'darwin':  # macOS
        print("macOS:")
        print("1. Install using Homebrew: brew install redis")
        print("2. Start Redis: brew services start redis")
        print("3. Or start manually: redis-server")
        
    elif system == 'linux':
        print("Linux:")
        print("Ubuntu/Debian:")
        print("  sudo apt update")
        print("  sudo apt install redis-server")
        print("  sudo systemctl start redis")
        print("  sudo systemctl enable redis")
        print()
        print("CentOS/RHEL:")
        print("  sudo yum install redis")
        print("  sudo systemctl start redis")
        print("  sudo systemctl enable redis")
        print()
        print("Or build from source:")
        print("  wget http://download.redis.io/redis-stable.tar.gz")
        print("  tar xvzf redis-stable.tar.gz")
        print("  cd redis-stable")
        print("  make")
        print("  sudo make install")
    
    else:
        print(f"Unsupported system: {system}")
        print("Please refer to Redis documentation for installation instructions")

def create_env_template():
    """Create .env template with Redis configuration"""
    env_template = """# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_URL=redis://localhost:6379/0

# Cache Settings
REDIS_CACHE_TTL=3600
REDIS_SESSION_TTL=86400
REDIS_CONNECTION_POOL_SIZE=10
REDIS_MAX_CONNECTIONS=50

# Cache Key Prefixes
REDIS_DOMAIN_CREDENTIALS_PREFIX=domain_creds:
REDIS_USER_SESSION_PREFIX=user_session:
REDIS_API_CACHE_PREFIX=api_cache:
REDIS_RATE_LIMIT_PREFIX=rate_limit:

# Rate Limiting
RATE_LIMIT_PER_MINUTE=100
"""
    
    env_file = '.env.redis'
    if not os.path.exists(env_file):
        with open(env_file, 'w') as f:
            f.write(env_template)
        print(f"✓ Created Redis environment template: {env_file}")
        print("Copy these settings to your main .env file")
    else:
        print(f"✓ Redis environment template already exists: {env_file}")

def test_redis_connection():
    """Test Redis connection with Python"""
    print("\nTesting Redis connection with Python...")
    
    try:
        import redis
        
        # Try to connect to Redis
        r = redis.Redis(host='localhost', port=6379, decode_responses=True)
        r.ping()
        print("✓ Redis connection successful")
        
        # Test basic operations
        r.set('test_key', 'test_value', ex=10)
        value = r.get('test_key')
        if value == 'test_value':
            print("✓ Redis read/write operations successful")
        else:
            print("✗ Redis read/write operations failed")
            return False
        
        r.delete('test_key')
        print("✓ Redis delete operation successful")
        return True
        
    except ImportError:
        print("✗ Redis Python package not installed")
        print("Install with: pip install redis")
        return False
    except Exception as e:
        print(f"✗ Redis connection failed: {str(e)}")
        return False

def install_python_requirements():
    """Install Python Redis requirements"""
    print("\nInstalling Python Redis requirements...")
    
    requirements = [
        'redis==5.0.1',
        'flask-redis==0.4.0',
        'redis-py-cluster==2.1.3'
    ]
    
    for req in requirements:
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', req], 
                         check=True, capture_output=True)
            print(f"✓ Installed {req}")
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to install {req}: {e}")

def main():
    """Main setup function"""
    print("Redis Setup for Recruitment Operations")
    print("=" * 50)
    
    # Check Redis installation
    redis_installed = check_redis_installation()
    
    if not redis_installed:
        print("\nRedis is not installed. Please install Redis first.")
        install_redis_instructions()
        return 1
    
    # Check if Redis is running
    redis_running = check_redis_running()
    
    if not redis_running:
        print("\nRedis is not running. Please start Redis server.")
        print("On Linux/macOS: sudo systemctl start redis or redis-server")
        print("On Windows: Run redis-server.exe")
        return 1
    
    # Install Python requirements
    install_python_requirements()
    
    # Create environment template
    create_env_template()
    
    # Test Python connection
    python_connection = test_redis_connection()
    
    if python_connection:
        print("\n🎉 Redis setup completed successfully!")
        print("\nNext steps:")
        print("1. Copy Redis settings from .env.redis to your main .env file")
        print("2. Run the application to test Redis integration")
        print("3. Run test_redis_integration.py to verify everything works")
        return 0
    else:
        print("\n❌ Redis setup incomplete. Please check the errors above.")
        return 1

if __name__ == '__main__':
    sys.exit(main())


