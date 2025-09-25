'use client';

import { useDomain } from '@/components/DomainProvider';
import { useState } from 'react';

export default function DomainTestPage() {
  const { isResolved, isLoading, error, domain } = useDomain();
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const testDomainConnection = async () => {
    setTesting(true);
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010';
      
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Domain Resolution Test</h1>
        
        {/* Domain Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Domain Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600">Domain</label>
              <p className="text-lg text-gray-900">{domain || 'Not detected'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600">Resolution Status</label>
              <div className="flex items-center">
                {isLoading ? (
                  <span className="text-yellow-600">Loading...</span>
                ) : isResolved ? (
                  <span className="text-green-600 flex items-center">
                    ✅ Resolved
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center">
                    ❌ Failed
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
              <p className="text-red-800">{error}</p>
            </div>
          )}
        </div>

        {/* Test Database Connection */}
        {isResolved && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Database Connection Test</h2>
            <button
              onClick={testDomainConnection}
              disabled={testing}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Database Connection'}
            </button>
            
            {testResult && (
              <div className="mt-4">
                <h3 className="font-medium text-gray-800 mb-2">Test Results:</h3>
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-800 mb-4">How It Works</h2>
          <ol className="list-decimal list-inside space-y-2 text-blue-700">
            <li>Frontend detects localhost and overrides with <code>http://rgvdit-rops.rigvedtech.com:3000</code></li>
            <li>Makes a POST request to <code>/api/domain/resolve</code> with the overridden domain URL</li>
            <li>Backend calls your external API at <code>http://172.16.16.33:5001/api/external/environment</code></li>
            <li>Extracts PostgreSQL credentials and sets up database connection</li>
            <li>All subsequent API calls use the domain-specific database</li>
          </ol>
          
          <div className="mt-4 p-4 bg-white rounded border">
            <h3 className="font-medium text-gray-800 mb-2">Expected Flow:</h3>
            <p className="text-sm text-gray-600">
              When you access <code>http://localhost:3000/</code> (for testing), the frontend automatically:
            </p>
            <ul className="list-disc list-inside mt-2 text-sm text-gray-600">
              <li>Detects localhost and overrides with: <code>http://rgvdit-rops.rigvedtech.com:3000</code></li>
              <li>Calls: <code>POST http://localhost:1010/api/domain/resolve</code></li>
              <li>Backend calls: <code>GET http://172.16.16.33:5001/api/external/environment/http%3A//rgvdit-rops.rigvedtech.com%3A3000/</code></li>
              <li>Sets up database connection with returned credentials</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
