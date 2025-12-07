'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import RoleGuard from '@/components/RoleGuard';

// Webhook URL - can be configured via environment variable
const JOB_POSTING_WEBHOOK_URL = process.env.NEXT_PUBLIC_JOB_POSTING_WEBHOOK_URL || 'http://172.16.16.14:5678/webhook/29467eb0-bc38-46a5-8d55-a8d2a6ff2698';

interface AssignedRecruiter {
  username: string;
  email?: string;
}

interface Requirement {
  request_id: string;
  job_title: string;
  job_description?: string;
  company_name?: string;
  is_job_posted: boolean;
  job_posted_at: string | null;
  created_at: string;
  assigned_recruiters?: AssignedRecruiter[];
}

const JobPostingPage: React.FC = () => {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();

  // Form state
  const [selectedRequirement, setSelectedRequirement] = useState<string>('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch requirements with posting status (includes assigned recruiters)
      const requirementsResponse = await api.getRequirementsWithPostingStatus();
      
      if (requirementsResponse.success) {
        setRequirements(requirementsResponse.data);
      }
    } catch (err) {
      setError('Failed to fetch data');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle requirement selection
  const handleRequirementChange = (requestId: string) => {
    setSelectedRequirement(requestId);
    setSuccessMessage(null);
    setError(null);
    
    if (!requestId) {
      setJobTitle('');
      setJobDescription('');
      setEmail('');
      return;
    }

    // Find the selected requirement
    const requirement = requirements.find(r => r.request_id === requestId);
    if (requirement) {
      setJobTitle(requirement.job_title || '');
      setJobDescription(requirement.job_description || '');
      
      // Get the email of assigned recruiters (directly from the response)
      if (requirement.assigned_recruiters && requirement.assigned_recruiters.length > 0) {
        const assignedEmails = requirement.assigned_recruiters
          .map(r => r.email)
          .filter(Boolean)
          .join(', ');
        setEmail(assignedEmails);
      } else {
        setEmail('');
      }
    }
  };

  // Handle form submission
  const handlePostJob = async () => {
    if (!selectedRequirement) {
      setError('Please select a requirement');
      return;
    }

    if (!jobTitle.trim()) {
      setError('Job title is required');
      return;
    }

    if (!jobDescription.trim()) {
      setError('Job description is required');
      return;
    }

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    try {
      setPosting(true);
      setError(null);
      setSuccessMessage(null);

      // Post to webhook
      const webhookPayload = {
        'job title': jobTitle,
        'job description': jobDescription,
        'email': email
      };

      const webhookResponse = await fetch(JOB_POSTING_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });

      if (!webhookResponse.ok) {
        throw new Error('Failed to post job to webhook');
      }

      // Update job posting status in the database
      await api.updateJobPostingStatus(selectedRequirement, true);

      // Refresh the requirements list
      await fetchData();

      setSuccessMessage('Job posted successfully!');
      
      // Reset form
      setSelectedRequirement('');
      setJobTitle('');
      setJobDescription('');
      setEmail('');

    } catch (err: any) {
      setError(err.message || 'Failed to post job');
      console.error('Error posting job:', err);
    } finally {
      setPosting(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Job Posting</h1>
              <p className="text-gray-600 dark:text-gray-400">Post job requirements to external platforms</p>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 rounded-lg">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Job Posting Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Post a Job</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Form */}
            <div className="space-y-4">
              {/* Requirement Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Requirement *
                </label>
                <select
                  value={selectedRequirement}
                  onChange={(e) => handleRequirementChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Select a Requirement --</option>
                  {requirements.map((req) => (
                    <option key={req.request_id} value={req.request_id}>
                      {req.request_id} - {req.job_title || 'No Title'} {req.is_job_posted ? '(Posted)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Job Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Job Title *
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Enter job title"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email *
                </label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter recruiter email(s)"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Auto-populated from assigned recruiters. You can edit if needed.
                </p>
              </div>
            </div>

            {/* Right Column - Job Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Job Description *
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Enter job description"
                rows={8}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handlePostJob}
              disabled={posting || !selectedRequirement}
              className={`px-6 py-3 rounded-lg font-medium text-white transition-colors ${
                posting || !selectedRequirement
                  ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
              }`}
            >
              {posting ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Posting...
                </span>
              ) : (
                'Post Job'
              )}
            </button>
          </div>
        </div>

        {/* Job Posting Status Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Job Posting Status</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Track which requirements have been posted
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Request ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Job Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Posted At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {requirements.map((req) => (
                  <tr key={req.request_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {req.request_id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">
                        {req.job_title || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {req.company_name || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {req.is_job_posted ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Posted
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                          Not Posted
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(req.job_posted_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(req.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {requirements.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">No requirements found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function JobPostingPageWrapper() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <JobPostingPage />
    </RoleGuard>
  );
}

