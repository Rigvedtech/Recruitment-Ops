'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { getStatusDisplayName } from '@/utils/statusFormatter';
import Select from 'react-select';
import { useTheme } from '@/context/ThemeContext';

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

interface RecruiterStats {
  profiles_added: number;
  profiles_selected: number;
  profiles_joined: number;
  month: string;
}

import { User } from '@/types/student';

const RECRUITER_FILTER_STORAGE_KEY = 'recruiter_filters'
const PAGE_SIZE = 15

const JDTrackerTable: React.FC = () => {
  const [requirements, setRequirements] = useState<TrackerRequirement[]>([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [recruiterStats, setRecruiterStats] = useState<RecruiterStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const { theme } = useTheme();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Filter options loaded from backend
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [jobTitleOptions, setJobTitleOptions] = useState<string[]>([]);
  const [recruiterOptions, setRecruiterOptions] = useState<string[]>([]);
  
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
  // appliedFilters always starts as all 'all' - filters are only applied when user clicks "Apply Filters"
  const [appliedFilters, setAppliedFilters] = useState({
    status: 'all',
    company: 'all',
    assignedTo: 'all',
    jobTitle: 'all',
    priority: 'all'
  })
  

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
      // Always show recent 15 on initial load - don't use pagination until user explicitly applies filters
      fetchTrackerData(userData, 1, appliedFilters, false);
      // Fetch recruiter stats for recruiter role only
      if (userData.role === 'recruiter') {
        fetchRecruiterStats();
      }
      // Load all filter values from backend
      ;(async () => {
        try {
          const [companyRes, priorityRes, jobTitleRes, statusRes, recruiterRes] = await Promise.all([
            api.get('/enum/get-enum-values?enum_type=company'),
            api.get('/enum/get-enum-values?enum_type=priority'),
            api.get('/enum/filter-values/job-title'),
            api.get('/enum/filter-values/status'),
            api.get('/enum/filter-values/recruiters')
          ])
          
          if (companyRes?.success && Array.isArray(companyRes.values)) {
            const sorted = [...companyRes.values].sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            setCompanyOptions(sorted)
          }
          if (priorityRes?.success && Array.isArray(priorityRes.values)) {
            const sorted = [...priorityRes.values].sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            setPriorityOptions(sorted)
          }
          if (jobTitleRes?.success && Array.isArray(jobTitleRes.values)) {
            const sorted = [...jobTitleRes.values].sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            setJobTitleOptions(sorted)
          }
          if (statusRes?.success && Array.isArray(statusRes.values)) {
            // Normalize status values: Candidate_Submission -> candidate submission
            const normalized = statusRes.values.map((s: string) => s.toLowerCase().replace(/_/g, ' '))
            setStatusOptions(normalized)
          }
          if (recruiterRes?.success && Array.isArray(recruiterRes.values)) {
            const sorted = [...recruiterRes.values].sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            setRecruiterOptions(sorted)
          }
        } catch (e) {
          console.error('Failed to load filter options', e)
        }
      })()
    } catch (err) {
      console.error('Error parsing stored user data:', err);
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  // Helper function to check if any filters are active
  const hasActiveFilters = (filters: typeof appliedFilters): boolean => {
    return Object.values(filters).some(filter => filter !== 'all')
  }

  // Helper function to convert normalized status back to backend format
  // "candidate submission" -> "Candidate_Submission"
  const denormalizeStatus = (status: string): string => {
    if (!status || status === 'all') return status
    return status
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('_')
  }

  const fetchTrackerData = async (currentUser?: User | null, pageNum: number = currentPage, filters: typeof appliedFilters = appliedFilters, usePagination: boolean = false) => {
    try {
      setLoadingTable(true);
      
      // Check if any filters are active
      const filtersActive = hasActiveFilters(filters);
      
      // Build query parameters
      const params = new URLSearchParams();
      
      // Use pagination if:
      // 1. Filters are active (any filter is not 'all'), OR
      // 2. Filters were explicitly applied (usePagination flag is true)
      // Otherwise, just fetch recent 15 using limit (initial load with no filters)
      if (filtersActive || usePagination) {
        params.append('page', pageNum.toString());
        params.append('pageSize', PAGE_SIZE.toString());
      } else {
        // No filters: just fetch recent 15 using limit parameter (for backward compatibility)
        params.append('limit', PAGE_SIZE.toString());
      }
      
      // Add filters (only if not 'all')
      if (filters.status && filters.status !== 'all') {
        // Convert normalized status back to backend format
        params.append('status', denormalizeStatus(filters.status));
      }
      if (filters.company && filters.company !== 'all') {
        params.append('company', filters.company);
      }
      if (filters.jobTitle && filters.jobTitle !== 'all') {
        params.append('jobTitle', filters.jobTitle);
      }
      if (filters.assignedTo && filters.assignedTo !== 'all') {
        params.append('assignedTo', filters.assignedTo);
      }
      if (filters.priority && filters.priority !== 'all') {
        params.append('priority', filters.priority);
      }
      
      // Try the new profiles-count endpoint with filters and pagination
      let data;
      try {
        data = await api.get(`/tracker/profiles-count?${params.toString()}`);
      } catch (err) {
        console.error('Error fetching tracker data with profiles count:', err);
        // Fallback to original endpoint if profiles-count fails
        data = await api.get(`/tracker?${params.toString()}`);
      }
      
      let items: TrackerRequirement[] = [];
      
      // Handle new paginated response format
      if (data && data.items) {
        items = data.items;
        // Update pagination info if provided
        if (data.pagination) {
          setTotalCount(data.pagination.total || 0);
        } else if (usePagination) {
          // If we're using pagination but backend doesn't return pagination info, 
          // we can't determine total count - this shouldn't happen with proper backend
          setTotalCount(0);
        } else {
          // When using limit (no filters), don't set totalCount (it's just the recent 15)
          setTotalCount(0);
        }
      } else if (data && data.requirements) {
        // Fallback for old format (when limit is used)
        items = data.requirements || [];
        if (usePagination) {
          // If we requested pagination but got old format, something is wrong
          // Don't set totalCount as we don't have the actual total
          setTotalCount(0);
        } else {
          // When using limit (no filters), don't set totalCount (it's just the recent 15)
          setTotalCount(0);
        }
      } else {
        // Fallback for array format
        items = (data || []) as TrackerRequirement[];
        if (usePagination) {
          // If we requested pagination but got array format, something is wrong
          // Don't set totalCount as we don't have the actual total
          setTotalCount(0);
        } else {
          // When using limit (no filters), don't set totalCount (it's just the recent 15)
          setTotalCount(0);
        }
      }
      
      // Client-side enforcement: recruiters should only see their assigned requirements
      const effectiveUser = currentUser ?? user;
      if (effectiveUser?.role === 'recruiter' && effectiveUser?.username) {
        const username = effectiveUser.username;
        const norm = (s: string | undefined | null) => (s || '').trim().toLowerCase();
        const normalizeStatus = (status?: string) => (status || '').toLowerCase().replace(/_/g, ' ').trim();
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
        // Filter: assigned to user AND not "On Hold" status (recruiters cannot see on-hold requirements)
        items = items.filter(req => isAssignedToUser(req) && normalizeStatus(req.status) !== 'on hold');
      }
      
      setRequirements(items);
    } catch (err) {
      setError('Failed to fetch tracker data');
      console.error('Error fetching tracker data:', err);
    } finally {
      setLoadingTable(false);
    }
  };

  const fetchRecruiterStats = async () => {
    try {
      setLoadingStats(true);
      const data = await api.get('/tracker/recruiter-stats');
      if (data.success) {
        setRecruiterStats({
          profiles_added: data.profiles_added,
          profiles_selected: data.profiles_selected,
          profiles_joined: data.profiles_joined,
          month: data.month
        });
      }
    } catch (err) {
      console.error('Error fetching recruiter stats:', err);
      // Silently fail - stats are not critical
    } finally {
      setLoadingStats(false);
    }
  };

  const handleRequestIdClick = (requestId: string) => {
    // Store source page for back navigation
    sessionStorage.setItem('workflow_source', 'recruiter');
    router.push(`/recruiter/workflow/${requestId}`);
  };

  // Filter options are now loaded from backend endpoints (no need for unique* calculations)
  
  // React-select dark mode styles
  const isDark = theme === 'dark'
  const selectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      backgroundColor: isDark ? '#1f2937' : 'white',
      borderColor: state.isFocused ? '#3b82f6' : (isDark ? '#4b5563' : '#d1d5db'),
      boxShadow: state.isFocused ? '0 0 0 2px rgba(59, 130, 246, 0.5)' : 'none',
      '&:hover': {
        borderColor: '#3b82f6'
      }
    }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: isDark ? '#1f2937' : 'white',
      zIndex: 9999
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected 
        ? '#3b82f6' 
        : state.isFocused 
          ? (isDark ? '#374151' : '#eff6ff')
          : (isDark ? '#1f2937' : 'white'),
      color: state.isSelected ? 'white' : (isDark ? '#f3f4f6' : '#111827'),
      '&:hover': {
        backgroundColor: state.isSelected ? '#3b82f6' : (isDark ? '#374151' : '#eff6ff')
      }
    }),
    input: (base: any) => ({
      ...base,
      color: isDark ? '#f3f4f6' : '#111827'
    }),
    singleValue: (base: any) => ({
      ...base,
      color: isDark ? '#f3f4f6' : '#111827'
    }),
    placeholder: (base: any) => ({
      ...base,
      color: isDark ? '#9ca3af' : '#6b7280'
    })
  }

  // Apply filters function
  const applyFilters = () => {
    const newAppliedFilters = { ...filters }
    setAppliedFilters(newAppliedFilters)
    localStorage.setItem(RECRUITER_FILTER_STORAGE_KEY, JSON.stringify(newAppliedFilters))
    setCurrentPage(1) // Reset to first page when filters are applied
    // Fetch data with new filters - always use pagination when filters are explicitly applied
    fetchTrackerData(user, 1, newAppliedFilters, true)
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
    setCurrentPage(1)
    localStorage.removeItem(RECRUITER_FILTER_STORAGE_KEY)
    // Don't use pagination when clearing filters - go back to initial state (recent 15)
    fetchTrackerData(user, 1, resetFilters, false)
  }

  // Filter change handler
  const handleFilterChange = (filterType: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }))
  }

  // Normalize status strings for comparison (handles underscores and casing)
  const normalizeStatus = (status?: string) => {
    if (!status) return ''
    return status.toLowerCase().replace(/_/g, ' ').trim()
  }

  // Check if filters are active - only when filters are explicitly applied (not just saved)
  const filtersActive = hasActiveFilters(appliedFilters)
  
  // Check if pagination is active (when totalCount > 0, it means pagination is being used)
  const paginationActive = totalCount > 0

  // Pagination is now handled server-side
  // Fetch on page change (only when pagination is active)
  useEffect(() => {
    // Only fetch on page change if pagination is active and we're not on initial load
    if (paginationActive && authChecked && user) {
      fetchTrackerData(user, currentPage, appliedFilters, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage])

  // Requirements are already filtered server-side, so use them directly
  const displayRequirements = requirements

  // For display purposes (pagination info)
  const totalItems = paginationActive ? totalCount : displayRequirements.length
  const totalPages = paginationActive ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 1
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const endIndex = paginationActive
    ? Math.min(startIndex + displayRequirements.length, totalItems)
    : displayRequirements.length


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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-6">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">JD Tracker</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Welcome, {user.username}! 
            {user?.role === 'recruiter' && (
              <span className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-medium rounded-full">
                Recruiter View - Showing only your assigned requirements
              </span>
            )}
            {user?.role === 'admin' && (
              <span className="ml-2 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-medium rounded-full">
                Admin View - Showing all requirements
              </span>
            )}
          </p>
        </div>

        {/* Recruiter Stats Cards - Only for recruiters */}
        {user?.role === 'recruiter' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Profiles Added Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Profiles Added</p>
                  {loadingStats ? (
                    <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1"></div>
                  ) : (
                    <p className={`text-2xl font-bold mt-1 ${
                      (recruiterStats?.profiles_added ?? 0) < 50 
                        ? 'text-red-600 dark:text-red-400' 
                        : (recruiterStats?.profiles_added ?? 0) < 90 
                          ? 'text-amber-600 dark:text-amber-400' 
                          : 'text-blue-600 dark:text-blue-400'
                    }`}>
                      {recruiterStats?.profiles_added ?? 0}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{recruiterStats?.month || 'This Month'}</p>
                </div>
                <div className={`p-3 rounded-full ${
                  (recruiterStats?.profiles_added ?? 0) < 50 
                    ? 'bg-red-50 dark:bg-red-900/30' 
                    : (recruiterStats?.profiles_added ?? 0) < 90 
                      ? 'bg-amber-50 dark:bg-amber-900/30' 
                      : 'bg-blue-50 dark:bg-blue-900/30'
                }`}>
                  <svg className={`w-6 h-6 ${
                    (recruiterStats?.profiles_added ?? 0) < 50 
                      ? 'text-red-600 dark:text-red-400' 
                      : (recruiterStats?.profiles_added ?? 0) < 90 
                        ? 'text-amber-600 dark:text-amber-400' 
                        : 'text-blue-600 dark:text-blue-400'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Profile Selection Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Profile Selection</p>
                  {loadingStats ? (
                    <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1"></div>
                  ) : (
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                      {recruiterStats?.profiles_selected ?? 0}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{recruiterStats?.month || 'This Month'}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-50 dark:bg-blue-900/30">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Joined Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Joined</p>
                  {loadingStats ? (
                    <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1"></div>
                  ) : (
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                      {recruiterStats?.profiles_joined ?? 0}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{recruiterStats?.month || 'This Month'}</p>
                </div>
                <div className="p-3 rounded-full bg-green-50 dark:bg-green-900/30">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden relative">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Job Requirements</h2>
          </div>

          {/* Filters Section - Always Visible */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
            {/* Filter Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Filters</span>
              </div>
              
              {/* Active Filters Count & Clear */}
              {Object.values(appliedFilters).filter(filter => filter !== 'all').length > 0 && (
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium">
                    {Object.values(appliedFilters).filter(filter => filter !== 'all').length} active
                  </span>
                  <button
                    onClick={clearFilters}
                    className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-medium"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {/* Filter Dropdowns Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
              {/* Status Filter */}
              <div>
                <Select
                  value={filters.status === 'all' 
                    ? { value: 'all', label: 'All Statuses' }
                    : filters.status 
                      ? { value: filters.status, label: filters.status.charAt(0).toUpperCase() + filters.status.slice(1) }
                      : null}
                  onChange={(selected) => handleFilterChange('status', selected?.value || 'all')}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    ...statusOptions
                      .filter(s => user?.role === 'admin' || s !== 'on hold')
                      .map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))
                  ]}
                  isSearchable={true}
                  placeholder="Select status..."
                  className="text-sm"
                  styles={selectStyles}
                />
              </div>

              {/* Company Filter */}
              <div>
                <Select
                  value={filters.company === 'all'
                    ? { value: 'all', label: 'All Companies' }
                    : filters.company
                      ? { value: filters.company, label: filters.company }
                      : null}
                  onChange={(selected) => handleFilterChange('company', selected?.value || 'all')}
                  options={[
                    { value: 'all', label: 'All Companies' },
                    ...companyOptions.map(c => ({ value: c, label: c }))
                  ]}
                  isSearchable={true}
                  placeholder="Select company..."
                  className="text-sm"
                  styles={selectStyles}
                />
              </div>

              {/* Job Title Filter */}
              <div>
                <Select
                  value={filters.jobTitle === 'all'
                    ? { value: 'all', label: 'All Job Titles' }
                    : filters.jobTitle
                      ? { value: filters.jobTitle, label: filters.jobTitle }
                      : null}
                  onChange={(selected) => handleFilterChange('jobTitle', selected?.value || 'all')}
                  options={[
                    { value: 'all', label: 'All Job Titles' },
                    ...jobTitleOptions.map(t => ({ value: t, label: t }))
                  ]}
                  isSearchable={true}
                  placeholder="Select job title..."
                  className="text-sm"
                  styles={selectStyles}
                />
              </div>

              {/* Assigned To Filter */}
              <div>
                <Select
                  value={filters.assignedTo === 'all'
                    ? { value: 'all', label: 'All Recruiters' }
                    : filters.assignedTo
                      ? { value: filters.assignedTo, label: filters.assignedTo }
                      : null}
                  onChange={(selected) => handleFilterChange('assignedTo', selected?.value || 'all')}
                  options={[
                    { value: 'all', label: 'All Recruiters' },
                    ...recruiterOptions.map(r => ({ value: r, label: r }))
                  ]}
                  isSearchable={true}
                  placeholder="Select recruiter..."
                  className="text-sm"
                  styles={selectStyles}
                />
              </div>

              {/* Priority Filter */}
              <div>
                <Select
                  value={filters.priority === 'all'
                    ? { value: 'all', label: 'All Priorities' }
                    : filters.priority
                      ? { value: filters.priority, label: filters.priority }
                      : null}
                  onChange={(selected) => handleFilterChange('priority', selected?.value || 'all')}
                  options={[
                    { value: 'all', label: 'All Priorities' },
                    ...priorityOptions.map(p => ({ value: p, label: p }))
                  ]}
                  isSearchable={true}
                  placeholder="Select priority..."
                  className="text-sm"
                  styles={selectStyles}
                />
              </div>
            </div>

            {/* Apply Button & Results Summary */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {paginationActive ? (
                  <span>
                    Showing {totalItems === 0 ? 0 : startIndex + 1}-{endIndex} of {totalItems} requirements
                    <span className="text-blue-600 dark:text-blue-400"> {filtersActive ? '(filtered)' : '(all requirements)'}</span>
                  </span>
                ) : (
                  <span>
                    Showing {displayRequirements.length} most recent requirements
                    {displayRequirements.length === PAGE_SIZE && <span className="text-gray-500 dark:text-gray-400"> (apply filters to see all)</span>}
                  </span>
                )}
              </div>
              <button
                onClick={applyFilters}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Apply Filters
              </button>
            </div>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
                <button 
                  onClick={() => {
                    // Use pagination only if filters are actually applied
                    const isActive = hasActiveFilters(appliedFilters)
                    fetchTrackerData(user, currentPage, appliedFilters, isActive)
                  }}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          
          {loadingTable ? (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-12">
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-300">Loading requirements...</p>
                </div>
              </div>
            </div>
          ) : displayRequirements.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
              <p className="text-lg">
                {user?.role === 'recruiter' 
                  ? "No requirements match the selected filters."
                  : "No requirements found matching the selected filters."
                }
              </p>
            </div>
          ) : (
            <>
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
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
                  {displayRequirements.map((requirement) => (
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
            </div>
            
            {/* Pagination Controls - Only show when pagination is active */}
            {totalItems > 0 && paginationActive && (
              <div className="flex items-center justify-center px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow">
                <div className="flex items-center gap-1">
                  {/* Prev */}
                  <button
                    aria-label="Previous page"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className={`w-8 h-8 flex items-center justify-center rounded-full ${
                      currentPage === 1 
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L8.414 10l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/>
                    </svg>
                  </button>

                  {(() => {
                    const pages: (number | string)[] = []
                    const add = (p: number | string) => pages.push(p)
                    const showRange = (start: number, end: number) => {
                      for (let i = start; i <= end; i++) add(i)
                    }
                    const left = Math.max(2, currentPage - 1)
                    const right = Math.min(totalPages - 1, currentPage + 1)
                    add(1)
                    if (left > 2) add('...')
                    showRange(left, right)
                    if (right < totalPages - 1) add('...')
                    if (totalPages > 1) add(totalPages)

                    return pages.map((p, idx) => (
                      typeof p === 'number' ? (
                        <button
                          key={`p-${p}-${idx}`}
                          onClick={() => setCurrentPage(p)}
                          className={`min-w-8 h-8 px-2 rounded-full text-sm flex items-center justify-center ${
                            p === currentPage 
                              ? 'bg-blue-600 text-white' 
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          {p}
                        </button>
                      ) : (
                        <span key={`e-${idx}`} className="px-2 text-gray-400 dark:text-gray-500 select-none">{p}</span>
                      )
                    ))
                  })()}

                  {/* Next */}
                  <button
                    aria-label="Next page"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className={`w-8 h-8 flex items-center justify-center rounded-full ${
                      currentPage === totalPages 
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 4.293a1 1 0 011.414 0L14 9.586a1 1 0 010 1.414l-5.293 5.293a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default JDTrackerTable; 