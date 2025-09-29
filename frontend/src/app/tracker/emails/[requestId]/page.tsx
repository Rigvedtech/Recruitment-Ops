'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Email } from '@/types/student';

const statusOptions = [
  'New',
  'Candidate Submission',
  'Interview Scheduled',
  'Offer Recommendation',
  'Closed'
];

export default function EmailsPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    // Check authentication first
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/login');
      return;
    }

    try {
      const userData = JSON.parse(storedUser);
      if (!userData.role || !['admin', 'recruiter'].includes(userData.role)) {
        router.push('/login');
        return;
      }
      setAuthChecked(true);
    } catch (error) {
      console.error('Error parsing user data:', error);
      localStorage.removeItem('user');
      router.push('/login');
      return;
    }
  }, [router]);

  useEffect(() => {
    if (!authChecked || !requestId) return;

    const fetchEmails = async () => {
      try {
        setLoading(true);
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976/api';
        const response = await fetch(`${apiBaseUrl}/tracker/emails/${requestId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch emails');
        }
        const data = await response.json();
        setEmails(data.emails || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch emails');
      } finally {
        setLoading(false);
      }
    };

    fetchEmails();
  }, [requestId, authChecked]);

  // Don't render anything until authentication is checked
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const updateEmailStatus = async (emailId: string, newStatus: string) => {
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976/api';
      const response = await fetch(`${apiBaseUrl}/tracker/emails/${emailId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      // Update the email in the local state
      setEmails(prevEmails =>
        prevEmails.map(email =>
          email.id === emailId ? { ...email, status: newStatus } : email
        )
      );

      if (selectedEmail?.id === emailId) {
        setSelectedEmail(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading emails...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                // Check source page to determine where to navigate back to
                const source = sessionStorage.getItem('workflow_source');
                const storedUser = localStorage.getItem('user');

                if (source === 'recruiter') {
                  // Came from recruiter page, go back to recruiter
                  window.location.href = '/recruiter';
                } else if (source === 'tracker' && storedUser) {
                  // Came from tracker page, check user role
                  try {
                    const userData = JSON.parse(storedUser);
                    if (userData.role === 'admin') {
                      window.location.href = '/tracker';
                    } else {
                      window.location.href = '/recruiter';
                    }
                  } catch (error) {
                    window.history.back();
                  }
                } else if (storedUser) {
                  // No source stored, use default logic
                  try {
                    const userData = JSON.parse(storedUser);
                    if (userData.role === 'admin') {
                      window.location.href = '/tracker';
                    } else {
                      window.location.href = '/recruiter';
                    }
                  } catch (error) {
                    window.history.back();
                  }
                } else {
                  window.history.back();
                }
              }}
              className="text-gray-600 hover:text-gray-900"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-gray-900">
                Emails for Request: {requestId}
              </h1>
            </div>
            <div className="text-sm text-gray-500">
              {emails.length} email{emails.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {emails.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📧</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No emails found</h2>
            <p className="text-gray-600">No emails were found for this request ID.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Email List */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Email List</h2>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {emails.map((email) => (
                    <div
                      key={email.id}
                      onClick={() => setSelectedEmail(email)}
                      className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedEmail?.id === email.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {email.subject || 'No Subject'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {email.from || 'Unknown Sender'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {email.date ? new Date(email.date).toLocaleString() : 'N/A'}
                          </p>
                        </div>
                        <div className="ml-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            email.status === 'New' ? 'bg-blue-100 text-blue-800' :
                            email.status === 'Candidate Submission' ? 'bg-green-100 text-green-800' :
                            email.status === 'Interview Scheduled' ? 'bg-orange-100 text-orange-800' :
                            email.status === 'Offer Recommendation' ? 'bg-purple-100 text-purple-800' :
                            email.status === 'Closed' ? 'bg-gray-100 text-gray-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {email.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Email Content */}
            <div className="lg:col-span-2">
              {selectedEmail ? (
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-gray-900">
                        {selectedEmail.subject || 'No Subject'}
                      </h2>
                      <div className="flex items-center space-x-2">
                        <select
                          value={selectedEmail.status}
                          onChange={(e) => updateEmailStatus(selectedEmail.id, e.target.value)}
                          className="text-sm border border-gray-300 rounded px-2 py-1"
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                        <span><strong>From:</strong> {selectedEmail.from || 'Unknown'}</span>
                        <span>{selectedEmail.date ? new Date(selectedEmail.date).toLocaleString() : 'N/A'}</span>
                      </div>
                      {selectedEmail.to && (
                        <div className="text-sm text-gray-600 mb-2">
                          <strong>To:</strong> {selectedEmail.to}
                        </div>
                      )}
                      {selectedEmail.cc && (
                        <div className="text-sm text-gray-600 mb-2">
                          <strong>CC:</strong> {selectedEmail.cc}
                        </div>
                      )}
                    </div>
                    <div className="prose max-w-none">
                      <div 
                        className="text-sm text-gray-800 whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: selectedEmail.body || 'No content' }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow flex items-center justify-center h-64">
                  <div className="text-center text-gray-500">
                    <div className="text-4xl mb-2">📧</div>
                    <p>Select an email to view its content</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 