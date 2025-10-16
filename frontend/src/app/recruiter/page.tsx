'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { getStatusDisplayName } from '@/utils/statusFormatter';

interface TrackerRequirement {
  id: number;
  request_id: string;
  job_title: string;
  email_subject: string;
  sender_email: string;
  sender_name: string;
  company_name: string;
  received_datetime: string | null;
  status: string;
  assigned_to: string;
  assigned_recruiters: string[];
  notes: string;
  created_at: string;
  updated_at: string;
  additional_remarks?: string;
  profiles_count?: number;
  onboarded_count?: number;
  breach_time_display?: string; // Updated to match SLA Dashboard format
  priority?: string;
  is_new_assignment?: boolean;
}

import { User } from '@/types/student';

interface RecruiterUser {
  id: number;
  username: string;
  email?: string;
  created_at: string;
}

const RECRUITER_FILTER_STORAGE_KEY = 'recruiter_filters'

const JDTrackerTable: React.FC = () => {
  const [requirements, setRequirements] = useState<TrackerRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  
  // Enhanced filter state with localStorage persistence
  const [filters, setFilters] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(RECRUITER_FILTER_STORAGE_KEY)
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          console.error('Error parsing saved recruiter filters:', e)
        }
      }
    }
    return {
      status: 'all',
      company: 'all',
      assignedTo: 'all',
      jobTitle: 'all',
      priority: 'all'
    }
  })
  const [appliedFilters, setAppliedFilters] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(RECRUITER_FILTER_STORAGE_KEY)
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          console.error('Error parsing saved recruiter filters:', e)
        }
      }
    }
    return {
      status: 'all',
      company: 'all',
      assignedTo: 'all',
      jobTitle: 'all',
      priority: 'all'
    }
  })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    // Check authentication first
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/login');
      return;
    }

    try {
      const userData: User = JSON.parse(storedUser);
      if (!userData.role || !['admin', 'recruiter'].includes(userData.role)) {
        router.push('/login');
        return;
      }
      setUser(userData);
      setAuthChecked(true);
      fetchTrackerData(userData);
    } catch (err) {
      console.error('Error parsing stored user data:', err);
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  const fetchTrackerData = async (currentUser?: User | null) => {
    try {
      setLoading(true);
      // Try the new profiles-count endpoint first
      const data = await api.get('/tracker/profiles-count');
      let items: TrackerRequirement[] = data.requirements || [];
      // Client-side enforcement: recruiters should only see their assigned requirements
      const effectiveUser = currentUser ?? user;
      if (effectiveUser?.role === 'recruiter' && effectiveUser?.username) {
        const username = effectiveUser.username;
        const norm = (s: string | undefined | null) => (s || '').trim().toLowerCase();
        const isAssignedToUser = (req: TrackerRequirement) => {
          const legacyAssignedTo = norm(req.assigned_to as unknown as string);
          if (legacyAssignedTo && legacyAssignedTo === norm(username)) return true;
          const ar = req.assigned_recruiters;
          if (!ar || ar.length === 0) return false;
          // Support both array of strings and accidental single comma-joined string
          const list: string[] = Array.isArray(ar) ? ar : String(ar).split(',');
          const normalized = list.map(v => norm(v)).filter(Boolean);
          return normalized.includes(norm(username));
        };
        items = items.filter(isAssignedToUser);
      }
      setRequirements(items);
    } catch (err) {
      console.error('Error fetching tracker data with profiles count:', err);
      // Fallback to original endpoint if profiles-count fails
      try {
        const data = await api.get('/tracker');
        let items: TrackerRequirement[] = (data || []) as TrackerRequirement[];
        const effectiveUser = currentUser ?? user;
        if (effectiveUser?.role === 'recruiter' && effectiveUser?.username) {
          const username = effectiveUser.username;
          const norm = (s: string | undefined | null) => (s || '').trim().toLowerCase();
          const isAssignedToUser = (req: TrackerRequirement) => {
            const legacyAssignedTo = norm(req.assigned_to as unknown as string);
            if (legacyAssignedTo && legacyAssignedTo === norm(username)) return true;
            const ar = req.assigned_recruiters;
            if (!ar || ar.length === 0) return false;
            const list: string[] = Array.isArray(ar) ? ar : String(ar).split(',');
            const normalized = list.map(v => norm(v)).filter(Boolean);
            return normalized.includes(norm(username));
          };
          items = items.filter(isAssignedToUser);
        }
        setRequirements(items);
      } catch (fallbackErr) {
        setError('Failed to fetch tracker data');
        console.error('Error fetching tracker data:', fallbackErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestIdClick = (requestId: string) => {
    // Store source page for back navigation
    sessionStorage.setItem('workflow_source', 'recruiter');
    router.push(`/recruiter/workflow/${requestId}`);
  };

  // Get unique values for filter dropdowns
  const uniqueCompanies = Array.from(new Set(requirements.map(req => req.company_name || req.sender_name).filter(Boolean)))
  const uniqueAssignedTo = Array.from(new Set(requirements.flatMap(req => req.assigned_recruiters || []).filter(Boolean)))
  const uniqueJobTitles = Array.from(new Set(requirements.map(req => req.job_title).filter(Boolean)))
  const uniquePriorities = Array.from(new Set(requirements.map(req => req.priority).filter(Boolean)))

  // Apply filters function
  const applyFilters = () => {
    setAppliedFilters({ ...filters })
    localStorage.setItem(RECRUITER_FILTER_STORAGE_KEY, JSON.stringify(filters))
    setShowFilters(false)
  }

  // Clear filters function
  const clearFilters = () => {
    const resetFilters = {
      status: 'all',
      company: 'all',
      assignedTo: 'all',
      jobTitle: 'all',
      priority: 'all'
    }
    setFilters(resetFilters)
    setAppliedFilters(resetFilters)
    localStorage.removeItem(RECRUITER_FILTER_STORAGE_KEY)
  }

  // Filter change handler
  const handleFilterChange = (filterType: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }))
  }



  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Enhanced filter requirements based on applied filters
  const filteredRequirements = requirements.filter(req => {
    // Status filter
    if (appliedFilters.status !== 'all' && (!req.status || req.status.toLowerCase() !== appliedFilters.status.toLowerCase())) {
      return false;
    }
    
    // Company filter
    if (appliedFilters.company !== 'all') {
      const companyName = req.company_name || req.sender_name;
      if (!companyName || companyName !== appliedFilters.company) {
        return false;
      }
    }
    
    // Assigned To filter
    if (appliedFilters.assignedTo !== 'all') {
      const assignedRecruiters = req.assigned_recruiters || [];
      if (!assignedRecruiters.includes(appliedFilters.assignedTo)) {
        return false;
      }
    }

    // Job Title filter
    if (appliedFilters.jobTitle !== 'all') {
      if (!req.job_title || req.job_title !== appliedFilters.jobTitle) {
        return false;
      }
    }

    // Priority filter
    if (appliedFilters.priority !== 'all') {
      if (!req.priority || req.priority !== appliedFilters.priority) {
        return false;
      }
    }
    
    return true;
  });

  // Don't render anything until authentication is checked
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If no user, show loading (should not happen with layout auth)
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600 text-center">
          <p className="text-xl font-semibold mb-2">Error</p>
          <p>{error}</p>
          <button
            onClick={() => fetchTrackerData(user)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-6">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">JD Tracker</h1>
          <p className="text-sm text-gray-600">
            Welcome, {user.username}! 
            {user?.role === 'recruiter' && (
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                Recruiter View - Showing only your assigned requirements
              </span>
            )}
            {user?.role === 'admin' && (
              <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                Admin View - Showing all requirements
              </span>
            )}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden relative">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Job Requirements</h2>
          </div>

          {/* Advanced Filters */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            {/* Advanced Filters Toggle */}
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Advanced Filters
                <svg className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Active Filters Count */}
              {Object.values(appliedFilters).filter(filter => filter !== 'all').length > 0 && (
                <div className="flex items-center text-sm text-gray-600">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    {Object.values(appliedFilters).filter(filter => filter !== 'all').length} active filters
                  </span>
                  <button
                    onClick={clearFilters}
                    className="ml-2 text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {/* Advanced Filters Panel */}
            {showFilters && (
              <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  
                  {/* Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Status</label>
                    <select
                      value={filters.status}
                      onChange={(e) => handleFilterChange('status', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Statuses</option>
                      <option value="open">Open</option>
                      <option value="candidate submission">Candidate Submission</option>
                      <option value="interview scheduled">Interview Scheduled</option>
                      <option value="offer recommendation">Offer Recommendation</option>
                      <option value="on boarding">On boarding</option>
                      <option value="on hold">On Hold</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>

                  {/* Company Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Company</label>
                    <select
                      value={filters.company}
                      onChange={(e) => handleFilterChange('company', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Companies</option>
                      {uniqueCompanies.map((company) => (
                        <option key={company} value={company}>
                          {company}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Job Title Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Job Title</label>
                    <select
                      value={filters.jobTitle}
                      onChange={(e) => handleFilterChange('jobTitle', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Job Titles</option>
                      {uniqueJobTitles.map((title) => (
                        <option key={title} value={title}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Assigned To Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Assigned To</label>
                    <select
                      value={filters.assignedTo}
                      onChange={(e) => handleFilterChange('assignedTo', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Recruiters</option>
                      {uniqueAssignedTo.map((recruiter) => (
                        <option key={recruiter} value={recruiter}>
                          {recruiter}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Priority</label>
                    <select
                      value={filters.priority}
                      onChange={(e) => handleFilterChange('priority', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Priorities</option>
                      {uniquePriorities.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </div>

                </div>

                {/* Filter Action Buttons */}
                <div className="flex justify-end space-x-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    Clear Filters
                  </button>
                  <button
                    onClick={applyFilters}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            )}

            {/* Results Summary */}
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Showing {filteredRequirements.length} of {requirements.length} requirements
              {Object.values(appliedFilters).filter(filter => filter !== 'all').length > 0 && (
                <span className="text-blue-600"> (filtered)</span>
              )}
            </div>
          </div>
          
          {filteredRequirements.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg">
                {user?.role === 'recruiter' 
                  ? "No requirements match the selected filters."
                  : "No requirements found matching the selected filters."
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto relative z-0">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Request ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Job Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Company</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Priority</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Assigned To</th>
              {user?.role === 'admin' && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Breached Time</th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total Profiles</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Selected Profiles</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredRequirements.map((requirement) => (
                    <tr key={requirement.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRequestIdClick(requirement.request_id)}
                            className="text-blue-600 hover:text-blue-800 font-medium underline"
                          >
                            {requirement.request_id}
                          </button>
                          {requirement.is_new_assignment && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-200">
                        {requirement.job_title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-200">
                        {requirement.company_name}
                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                          ${requirement.status.toLowerCase() === 'open' ? 'bg-green-100 text-green-800' : 
                      'bg-gray-100 text-gray-800'}`}>
                          {getStatusDisplayName(requirement.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-wrap gap-1">
                          {(requirement.assigned_recruiters || []).length > 0 ? (
                            requirement.assigned_recruiters.map((recruiter) => (
                              <span
                                key={recruiter}
                                className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800"
                              >
                                {recruiter}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                              Unassigned
                            </span>
                          )}
                        </div>
                      </td>
                      {user?.role === 'admin' && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {requirement.breach_time_display ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                              {requirement.breach_time_display}
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                              On Time
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                          {requirement.profiles_count || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="px-2 py-1 bg-pink-100 text-pink-800 text-xs font-medium rounded-full">
                          {requirement.onboarded_count || 0}
                        </span>
                      </td>
              </tr>
            ))}
          </tbody>
        </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JDTrackerTable; 