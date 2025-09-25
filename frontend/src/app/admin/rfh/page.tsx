'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import RoleGuard from '@/components/RoleGuard';

interface Requirement {
  id: number;
  request_id: string;
  job_title: string;
  email_subject: string;
  assigned_to: string;
  assigned_recruiters: string[];
  is_manual_requirement?: boolean;
  created_at: string;
  updated_at: string;
  priority?: string;
}

interface Recruiter {
  id: number;
  username: string;
  email?: string;
  role: string;
}

const AdminRFHPage: React.FC = () => {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [requirementsData, recruitersData] = await Promise.all([
        api.get('/requirements'),
        api.get('/users/recruiters')
      ]);
      
      // Sort requirements: priority first, then unassigned first, then by creation date (newest first)
      const sortedRequirements = requirementsData.sort((a: Requirement, b: Requirement) => {
        // Priority sorting (Urgent > High > Medium > Low > None)
        const priorityOrder = {'Urgent': 1, 'High': 2, 'Medium': 3, 'Low': 4};
        const aPriority = a.priority ? (priorityOrder[a.priority] || 5) : 5;
        const bPriority = b.priority ? (priorityOrder[b.priority] || 5) : 5;
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        
        // Check if requirement is unassigned (same priority, now sort by assignment)
        const aAssignedRecruiters = a.assigned_recruiters || [];
        const bAssignedRecruiters = b.assigned_recruiters || [];
        const aIsUnassigned = !a.assigned_to || aAssignedRecruiters.length === 0;
        const bIsUnassigned = !b.assigned_to || bAssignedRecruiters.length === 0;
        
        // If one is unassigned and the other isn't, unassigned comes first
        if (aIsUnassigned && !bIsUnassigned) return -1;
        if (!aIsUnassigned && bIsUnassigned) return 1;
        
        // If both have same assignment status, sort by creation date (newest first)
        const aDate = new Date(a.created_at).getTime();
        const bDate = new Date(b.created_at).getTime();
        return bDate - aDate;
      });
      
      setRequirements(sortedRequirements);
      setRecruiters(recruitersData);
    } catch (err) {
      setError('Failed to fetch data');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRecruiters = async (requestId: string, selectedRecruiters: string[]) => {
    try {
      setUpdating(requestId);
      await api.put(`/tracker/${requestId}`, {
        assigned_to: selectedRecruiters
      });
      
      // Update local state
      setRequirements(prev => 
        prev.map(req => 
          req.request_id === requestId 
            ? { 
                ...req, 
                assigned_to: selectedRecruiters.join(', '),
                assigned_recruiters: selectedRecruiters
              }
            : req
        )
      );
    } catch (err) {
      console.error('Error assigning recruiters:', err);
      alert('Failed to assign recruiters');
    } finally {
      setUpdating(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-lg">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Manage RFH</h1>
          <p className="text-gray-600">Assign recruiters to job requirements</p>
        </div>

        {/* Requirements Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assign Recruiters
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requirements.map((requirement) => (
                  <tr key={requirement.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          {requirement.request_id}
                        </span>
                        {requirement.is_manual_requirement && (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800" title="Manually added requirement">
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                            </svg>
                            Manual
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {requirement.job_title || requirement.email_subject}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {requirement.priority ? (
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          requirement.priority === 'Urgent' ? 'bg-red-200 text-red-900' :
                          requirement.priority === 'High' ? 'bg-red-100 text-red-800' :
                          requirement.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          requirement.priority === 'Low' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {requirement.priority}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(requirement.assigned_recruiters || []).map((recruiter) => (
                            <span
                              key={recruiter}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            >
                              {recruiter}
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedRecruiters = (requirement.assigned_recruiters || []).filter(r => r !== recruiter);
                                  handleAssignRecruiters(requirement.request_id, updatedRecruiters);
                                }}
                                className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-500 focus:outline-none"
                                disabled={updating === requirement.request_id}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              const currentRecruiters = requirement.assigned_recruiters || [];
                              if (!currentRecruiters.includes(e.target.value)) {
                                handleAssignRecruiters(requirement.request_id, [...currentRecruiters, e.target.value]);
                              }
                              e.target.value = '';
                            }
                          }}
                          disabled={updating === requirement.request_id}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                          <option value="">Add Recruiter</option>
                          {recruiters
                            .filter(recruiter => !(requirement.assigned_recruiters || []).includes(recruiter.username))
                            .map((recruiter) => (
                              <option key={recruiter.id} value={recruiter.username}>
                                {recruiter.username}
                              </option>
                            ))}
                        </select>
                        {updating === requirement.request_id && (
                          <div className="mt-1">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(requirement.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {requirements.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No requirements found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default function AdminRFHPageWrapper() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <AdminRFHPage />
    </RoleGuard>
  );
} 