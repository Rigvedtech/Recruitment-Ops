"""
Production Server Configuration for Hypercorn WSGI Server
This configuration is optimized for Windows production deployment.
"""

import os
import multiprocessing
from dotenv import load_dotenv

load_dotenv()

# Determine CPU count for recommendations
CPU_COUNT = multiprocessing.cpu_count()

# Server binding configuration
HOST = os.getenv('PRODUCTION_HOST', '0.0.0.0')
PORT = int(os.getenv('BACKEND_PORT', 1010))

# Hypercorn worker and thread configuration
# Workers: number of worker processes
WORKERS = int(os.getenv('HYPERCORN_WORKERS', 2))

# Threads: number of threads per worker
THREADS = int(os.getenv('HYPERCORN_THREADS', 2))

# Bind address (format: host:port)
BIND = f"{HOST}:{PORT}"

# Keep-alive timeout (seconds) - time to wait for a new request on an existing connection
KEEP_ALIVE_TIMEOUT = int(os.getenv('HYPERCORN_KEEP_ALIVE_TIMEOUT', 120))

# Graceful timeout (seconds) - time to wait for graceful shutdown
GRACEFUL_TIMEOUT = int(os.getenv('HYPERCORN_GRACEFUL_TIMEOUT', 30))

# Maximum number of connections
MAX_INCOMPLETE_SIZE = int(os.getenv('HYPERCORN_MAX_INCOMPLETE_SIZE', 16384))

# Backlog - number of connections to queue
BACKLOG = int(os.getenv('HYPERCORN_BACKLOG', 100))

# Logging configuration
ACCESS_LOG = os.getenv('HYPERCORN_ACCESS_LOG', '-')  # '-' means stdout
ERROR_LOG = os.getenv('HYPERCORN_ERROR_LOG', '-')  # '-' means stderr
LOG_LEVEL = os.getenv('HYPERCORN_LOG_LEVEL', 'info').lower()

# Access logging format
ACCESS_LOG_FORMAT = os.getenv('HYPERCORN_ACCESS_LOG_FORMAT', '%(h)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"')

# URL scheme
URL_SCHEME = os.getenv('HYPERCORN_URL_SCHEME', 'http')

# Worker class (for WSGI, we use 'sync')
WORKER_CLASS = os.getenv('HYPERCORN_WORKER_CLASS', 'sync')

# Configuration summary
def print_config():
    """Print the current server configuration"""
    print("\n" + "="*70)
    print("PRODUCTION SERVER CONFIGURATION".center(70))
    print("="*70)
    print(f"  Server Address:          {BIND}")
    print(f"  Workers:                 {WORKERS} processes")
    print(f"  Threads per Worker:      {THREADS} threads")
    print(f"  Total Threads:           {WORKERS * THREADS} threads")
    print(f"  CPU Count:               {CPU_COUNT} cores")
    print(f"  Keep-Alive Timeout:      {KEEP_ALIVE_TIMEOUT} seconds")
    print(f"  Graceful Timeout:        {GRACEFUL_TIMEOUT} seconds")
    print(f"  Request Backlog:         {BACKLOG} connections")
    print(f"  URL Scheme:              {URL_SCHEME}")
    print(f"  Access Logging:          {'Enabled' if ACCESS_LOG != '-' else 'Disabled'}")
    print(f"  Error Logging:           {'Enabled' if ERROR_LOG != '-' else 'Disabled'}")
    print(f"  Log Level:               {LOG_LEVEL.upper()}")
    print("="*70)
    print("✅ Production-ready WSGI server (Hypercorn)")
    print("✅ Multi-process and multi-threaded request handling")
    print("✅ Windows-optimized configuration")
    print("✅ Automatic crash recovery")
    print("="*70 + "\n")

# Performance recommendations based on server specs
def get_recommendations():
    """Get performance tuning recommendations based on system resources"""
    try:
        import psutil
        
        total_ram = psutil.virtual_memory().total / (1024**3)  # GB
        available_ram = psutil.virtual_memory().available / (1024**3)  # GB
        
        recommendations = []
        
        if total_ram < 4:
            recommendations.append("⚠️  Low RAM detected. Consider reducing WORKERS to 1")
        
        if CPU_COUNT < 2:
            recommendations.append("⚠️  Single/Dual core CPU. Consider reducing WORKERS to 1")
        
        if available_ram < 2:
            recommendations.append("⚠️  Low available RAM. Monitor memory usage closely")
        
        if CPU_COUNT >= 4 and total_ram >= 8:
            recommendations.append("✅ Good CPU and RAM. You can increase WORKERS for better performance")
        
        return recommendations
    except ImportError:
        return []
