'use client';

import { useDomainResolver } from '@/hooks/useDomainResolver';
import { useState } from 'react';

export default function DomainTestPage() {
  const { isResolved, isLoading, error, domain } = useDomainResolver();
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const testDomainConnection = async () => {
    setTesting(true);
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976';
      
      // Handle case where API_BASE_URL already includes /api
      const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
      const response = await fetch(`${baseUrl}/domain/test`);
      const data = await response.json();
      setTestResult(data);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Domain Resolution Test</h1>
        
        {/* Domain Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6 border border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Domain Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">Domain</label>
              <p className="text-lg text-gray-900 dark:text-gray-100">{domain || 'Not detected'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">Resolution Status</label>
              <div className="flex items-center">
                {isLoading ? (
                  <span className="text-yellow-600 dark:text-yellow-400">Loading...</span>
                ) : isResolved ? (
                  <span className="text-green-600 dark:text-green-400 flex items-center">
                    ✅ Resolved
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 flex items-center">
                    ❌ Failed
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded">
              <p className="text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Test Database Connection */}
        {isResolved && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6 border border-gray-100 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Database Connection Test</h2>
            <button
              onClick={testDomainConnection}
              disabled={testing}
              className="bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Database Connection'}
            </button>
            
            {testResult && (
              <div className="mt-4">
                <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Test Results:</h3>
                <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded text-sm overflow-auto text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-800 dark:text-blue-300 mb-4">How It Works</h2>
          <ol className="list-decimal list-inside space-y-2 text-blue-700 dark:text-blue-300">
            <li>Frontend detects localhost and overrides with <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">http://rgvdit-rops.rigvedtech.com:3000</code></li>
            <li>Makes a POST request to <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">/api/domain/resolve</code> with the overridden domain URL</li>
            <li>Backend calls your external API at <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">http://172.16.16.33:5001/api/external/environment</code></li>
            <li>Extracts PostgreSQL credentials and sets up database connection</li>
            <li>All subsequent API calls use the domain-specific database</li>
          </ol>
          
          <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Expected Flow:</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              When you access <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">http://localhost:3000/</code> (for testing), the frontend automatically:
            </p>
            <ul className="list-disc list-inside mt-2 text-sm text-gray-600 dark:text-gray-300">
              <li>Detects localhost and overrides with: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">http://rgvdit-rops.rigvedtech.com:3000</code></li>
              <li>Calls: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">POST http://20.188.122.171:1976/api/domain/resolve</code></li>
              <li>Backend calls: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">GET http://172.16.16.33:5001/api/external/environment/http%3A//rgvdit-rops.rigvedtech.com%3A3000/</code></li>
              <li>Sets up database connection with returned credentials</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
