'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/services/api'
import { getStatusDisplayName } from '@/utils/statusFormatter'
import JobDescriptionModal from '@/components/JobDescriptionModal'
import Select from 'react-select'
import { useTheme } from '@/context/ThemeContext'

interface TrackerRequirement {
  id: number
  request_id: string
  job_title: string
  email_subject: string
  sender_email: string
  sender_name: string
  company_name: string
  received_datetime: string | null
  status: string
  assigned_to: string
  assigned_recruiters: string[]
  notes: string
  created_at: string
  updated_at: string
  additional_remarks?: string;
  detected_category?: string;
  is_manual_requirement?: boolean;
  // Additional requirement fields
  department?: string;
  location?: string;
  shift?: string;
  job_type?: string;
  hiring_manager?: string;
  experience_range?: string;
  skills_required?: string;
  minimum_qualification?: string;
  number_of_positions?: number;
  budget_ctc?: string;
  priority?: string;
  tentative_doj?: string;
  // Job Description fields
  job_description?: string;
  jd_path?: string;
  job_file_name?: string;
}

interface TrackerStats {
  total: number
  open: number
  candidate_submission: number
  interview_scheduled: number
  offer_recommendation: number
  on_boarding: number
  on_hold: number
  closed: number
}

const FILTER_STORAGE_KEY = 'tracker_filters'

// Normalize backend status strings to a consistent, comparable form
const normalizeStatus = (status?: string) => {
  if (!status) return ''
  return status.toLowerCase().replace(/_/g, ' ').trim()
}

const TrackerPage: React.FC = () => {
  const router = useRouter()
  const [requirements, setRequirements] = useState<TrackerRequirement[]>([])
  const [closedRequirements, setClosedRequirements] = useState<any[]>([])
  const [stats, setStats] = useState<TrackerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequirement, setSelectedRequirement] = useState<TrackerRequirement | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [archivedRequirements, setArchivedRequirements] = useState<any[]>([])
  const [showArchived, setShowArchived] = useState(false)
  
  // Loading states for lazy-loaded tabs
  const [loadingClosed, setLoadingClosed] = useState(false)
  const [loadingOnHold, setLoadingOnHold] = useState(false)
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [loadingTable, setLoadingTable] = useState(false)
  
  // View JD Modal state
  const [showViewJDModal, setShowViewJDModal] = useState(false)
  // Pagination
  const PAGE_SIZE = 15
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Enhanced filter state with localStorage persistence
  const [filters, setFilters] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY)
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          console.error('Error parsing saved filters:', e)
        }
      }
    }
    return {
      status: 'all',
      company: 'all',
      assignedTo: 'all',
      jobTitle: 'all',
      priority: 'all',
      department: 'all',
      location: 'all'
    }
  })
  const [appliedFilters, setAppliedFilters] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY)
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          console.error('Error parsing saved filters:', e)
        }
      }
    }
    return {
      status: 'all',
      company: 'all',
      assignedTo: 'all',
      jobTitle: 'all',
      priority: 'all',
      department: 'all',
      location: 'all'
    }
  })
  const [showFilters, setShowFilters] = useState(false)
  const { theme } = useTheme()

  // Filter options loaded from backend (database)
  const [companyOptions, setCompanyOptions] = useState<string[]>([])
  const [statusOptions, setStatusOptions] = useState<string[]>([])
  const [priorityOptions, setPriorityOptions] = useState<string[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([])
  const [locationOptions, setLocationOptions] = useState<string[]>([])
  const [jobTitleOptions, setJobTitleOptions] = useState<string[]>([])
  const [recruiterOptions, setRecruiterOptions] = useState<string[]>([])

  useEffect(() => {
    // Check authentication first
    const storedUser = localStorage.getItem('user')
    if (!storedUser) {
      router.push('/login')
      return
    }

    try {
      const userData = JSON.parse(storedUser)
      if (!userData.role || !['admin', 'recruiter'].includes(userData.role)) {
        router.push('/login')
        return
      }
      setCurrentUser(userData)
      setAuthChecked(true)
      // Check if filters were previously applied (saved in localStorage)
      const hasSavedFilters = typeof window !== 'undefined' && localStorage.getItem(FILTER_STORAGE_KEY) !== null
      fetchTrackerData(1, appliedFilters, hasSavedFilters)
      // Load all enum/filter values from backend
      ;(async () => {
        try {
          const [companyRes, priorityRes, deptRes, locationRes, jobTitleRes, statusRes, recruiterRes] = await Promise.all([
            api.get('/enum/get-enum-values?enum_type=company'),
            api.get('/enum/get-enum-values?enum_type=priority'),
            api.get('/enum/get-enum-values?enum_type=department'),
            api.get('/enum/filter-values/location'),
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
          if (deptRes?.success && Array.isArray(deptRes.values)) {
            const sorted = [...deptRes.values].sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            setDepartmentOptions(sorted)
          }
          if (locationRes?.success && Array.isArray(locationRes.values)) {
            const sorted = [...locationRes.values].sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            setLocationOptions(sorted)
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
    } catch (error) {
      console.error('Error parsing user data:', error)
      localStorage.removeItem('user')
      router.push('/login')
    }
  }, []) // Fixed: Removed router dependency to prevent duplicate API calls



  // Helper function to check if any filters are active
  const hasActiveFilters = (filters: typeof appliedFilters): boolean => {
    return Object.values(filters).some(filter => filter !== 'all')
  }

  // Helper function to check if filters were explicitly applied (saved in localStorage)
  const hasAppliedFilters = (): boolean => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY)
      return saved !== null
    }
    return false
  }

  const fetchTrackerData = async (pageNum: number = currentPage, filters: typeof appliedFilters = appliedFilters, usePagination: boolean = false) => {
    try {
      setLoadingTable(true)
      
      // Check if any filters are active
      const filtersActive = hasActiveFilters(filters)
      
      // Build query parameters
      const params = new URLSearchParams()
      
      // Use pagination if:
      // 1. Filters are active (any filter is not 'all'), OR
      // 2. Filters were explicitly applied (usePagination flag is true)
      // Otherwise, just fetch recent 15 (initial load with no filters)
      if (filtersActive || usePagination) {
        params.append('page', pageNum.toString())
        params.append('pageSize', PAGE_SIZE.toString())
      } else {
        // No filters: just fetch recent 15 (page=1, pageSize=15)
        params.append('page', '1')
        params.append('pageSize', PAGE_SIZE.toString())
      }
      
      // Add filters (only if not 'all')
      if (filters.status && filters.status !== 'all') {
        params.append('status', filters.status)
      }
      if (filters.company && filters.company !== 'all') {
        params.append('company', filters.company)
      }
      if (filters.jobTitle && filters.jobTitle !== 'all') {
        params.append('jobTitle', filters.jobTitle)
      }
      if (filters.assignedTo && filters.assignedTo !== 'all') {
        params.append('assignedTo', filters.assignedTo)
      }
      if (filters.priority && filters.priority !== 'all') {
        params.append('priority', filters.priority)
      }
      if (filters.department && filters.department !== 'all') {
        params.append('department', filters.department)
      }
      if (filters.location && filters.location !== 'all') {
        params.append('location', filters.location)
      }
      
      const [requirementsResponse, statsData] = await Promise.all([
        api.get(`/tracker?${params.toString()}`),
        api.get('/tracker/stats')
      ])
      
      // Handle new paginated response format
      if (requirementsResponse && requirementsResponse.items) {
        setRequirements(requirementsResponse.items)
        // Update pagination info if provided
        if (requirementsResponse.pagination) {
          setTotalCount(requirementsResponse.pagination.total || 0)
        } else if (filtersActive || usePagination) {
          // If we're using pagination but backend doesn't return pagination info, use items length
          setTotalCount(requirementsResponse.items?.length || 0)
        }
      } else {
        // Fallback for old format (backward compatibility)
        setRequirements(requirementsResponse || [])
        if (filtersActive || usePagination) {
          setTotalCount(requirementsResponse?.length || 0)
        } else {
          setTotalCount(requirementsResponse?.length || 0)
        }
      }
      
      setStats(statsData)
      // Don't fetch closed requirements initially - lazy load when clicked
    } catch (err) {
      setError('Failed to fetch tracker data')
      console.error('Error fetching tracker data:', err)
    } finally {
      setLoadingTable(false)
      setLoading(false)
    }
  }

  const updateRequirement = async (requestId: string, updates: Partial<TrackerRequirement>) => {
    try {
      const updatedRequirement = await api.put(`/tracker/${requestId}`, updates)
      setRequirements(prev => 
        prev.map(req => req.request_id === requestId ? updatedRequirement : req)
      )
      setSelectedRequirement(updatedRequirement)
      // Refresh stats
      const statsData = await api.get('/tracker/stats')
      setStats(statsData)
      
      // Close modal and show success message
      setShowModal(false)
      setShowSuccessMessage(true)
      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccessMessage(false), 3000)
    } catch (err: any) {
      console.error('Error updating requirement:', err)
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to update requirement'
      alert(errorMessage)
    }
  }

  const restoreRequirement = async (requestId: string) => {
    try {
      await api.post(`/tracker/${requestId}/restore`, {})
      // Refresh both active and archived requirements
      fetchTrackerData()
      fetchArchivedRequirements()
      alert('Requirement restored successfully!')
    } catch (err) {
      console.error('Error restoring requirement:', err)
      alert('Failed to restore requirement. Please try again.')
    }
  }

  const fetchClosedRequirements = async () => {
    if (closedRequirements.length > 0) return // Already loaded
    try {
      setLoadingClosed(true)
      const closedData = await api.get('/tracker/closed')
      setClosedRequirements(closedData)
    } catch (err) {
      console.error('Error fetching closed requirements:', err)
      alert('Failed to load closed requirements. Please try again.')
    } finally {
      setLoadingClosed(false)
    }
  }

  const fetchOnHoldRequirements = async () => {
    // On-hold requirements are already in the main requirements list
    // Just filter them client-side
    return
  }

  const fetchArchivedRequirements = async () => {
    if (archivedRequirements.length > 0) return // Already loaded
    try {
      setLoadingArchived(true)
      const archivedData = await api.get('/tracker/archived')
      setArchivedRequirements(archivedData)
    } catch (err) {
      console.error('Error fetching archived requirements:', err)
      alert('Failed to load archived requirements. Please try again.')
    } finally {
      setLoadingArchived(false)
    }
  }

  const handleRequestIdClick = (requestId: string) => {
    router.push(`/recruiter/workflow/${requestId}`)
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) {
      return 'N/A'
    }
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      return 'Invalid Date'
    }
  }

  const normalizeStatus = (status?: string) => {
    if (!status) return ''
    return status.toLowerCase().replace(/_/g, ' ').trim()
  }

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

  const getStatusColor = (status: string) => {
    switch (normalizeStatus(status)) {
      case 'open': return 'bg-green-100 text-green-800'
      case 'candidate submission': return 'bg-purple-100 text-purple-800'
      case 'interview scheduled': return 'bg-orange-100 text-orange-800'
      case 'offer recommendation': return 'bg-indigo-100 text-indigo-800'
      case 'on boarding': return 'bg-pink-100 text-pink-800'
      case 'on hold': return 'bg-red-100 text-red-800'
      case 'closed': return 'bg-gray-100 text-gray-800'
      default: return 'bg-blue-100 text-blue-800'
    }
  }

  // Filter options are now loaded from backend endpoints (no need for unique* calculations)

  // Apply filters function
  const applyFilters = () => {
    const newAppliedFilters = { ...filters }
    setAppliedFilters(newAppliedFilters)
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(newAppliedFilters))
    setShowFilters(false)
    setCurrentPage(1) // Reset to first page when filters are applied
    // Fetch data with new filters - always use pagination when filters are explicitly applied
    fetchTrackerData(1, newAppliedFilters, true)
  }

  // Clear filters function
  const clearFilters = () => {
    const resetFilters = {
      status: 'all',
      company: 'all',
      assignedTo: 'all',
      jobTitle: 'all',
      priority: 'all',
      department: 'all',
      location: 'all'
    }
    setFilters(resetFilters)
    setAppliedFilters(resetFilters)
    setFilterStatus('all')
    setCurrentPage(1)
    localStorage.removeItem(FILTER_STORAGE_KEY)
    // Don't use pagination when clearing filters - go back to initial state (recent 15)
    fetchTrackerData(1, resetFilters, false)
  }

  // Filter change handler
  const handleFilterChange = (filterType: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }))
  }

  // For archived/closed views, use client-side filtering
  // For main view, requirements are already filtered server-side
  const displayRequirements = showArchived 
    ? archivedRequirements
    : filterStatus === 'closed' 
    ? closedRequirements 
    : requirements // Already filtered server-side

  // Check if filters are active (for hybrid pagination approach)
  // Consider filters active if:
  // 1. Any filter is not 'all', OR
  // 2. Filters were explicitly applied (saved in localStorage)
  const filtersActive = hasActiveFilters(appliedFilters) || hasAppliedFilters()

  // Pagination is now handled server-side
  // Fetch on page change (only for main view with filters, not archived/closed)
  // Only trigger when filters are active (hybrid approach)
  useEffect(() => {
    // Only fetch on page change if filters are active and we're not on initial load
    if (!showArchived && filterStatus !== 'closed' && filtersActive) {
      fetchTrackerData(currentPage, appliedFilters, true)
    }
  }, [currentPage])

  // For display purposes (pagination info)
  // For server-side paginated results with filters, use totalCount from API
  // For archived/closed, use local array length
  // For default view (no filters), don't show pagination
  const totalItems = showArchived || filterStatus === 'closed' 
    ? displayRequirements.length 
    : filtersActive
      ? totalCount
      : displayRequirements.length // When no filters, just show count of displayed items
  const totalPages = filtersActive && !showArchived && filterStatus !== 'closed'
    ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    : Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const endIndex = showArchived || filterStatus === 'closed'
    ? Math.min(startIndex + PAGE_SIZE, totalItems)
    : filtersActive
      ? startIndex + displayRequirements.length
      : displayRequirements.length
  const paginatedRequirements = displayRequirements

  // Don't render anything until authentication is checked
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                Requirement updated successfully!
              </p>
            </div>
          </div>
        </div>
      )}

        <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">RFH Tracker</h1>
        
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Total RFH</h3>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{stats.total}</p>
                </div>
                <div className="p-2 bg-blue-100 rounded-full">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Open</h3>
                  <p className="text-2xl font-bold text-green-600 mt-1">{stats.open}</p>
                </div>
                <div className="p-2 bg-green-100 rounded-full">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-purple-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Candidate Submission</h3>
                  <p className="text-2xl font-bold text-purple-600 mt-1">{stats.candidate_submission}</p>
                </div>
                <div className="p-2 bg-purple-100 rounded-full">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-orange-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Interview Scheduled</h3>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{stats.interview_scheduled}</p>
                </div>
                <div className="p-2 bg-orange-100 rounded-full">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-indigo-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Offer Recommendation</h3>
                  <p className="text-2xl font-bold text-indigo-600 mt-1">{stats.offer_recommendation}</p>
                </div>
                <div className="p-2 bg-indigo-100 rounded-full">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v6a2 2 0 002 2h2m0-8H5m4 0V9a2 2 0 012-2h2m-6 4h6m-6 4h6m2-10V7a2 2 0 012-2h2a2 2 0 012 2v2m-6 0h6" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-pink-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">On Boarding</h3>
                  <p className="text-2xl font-bold text-pink-600 mt-1">{stats.on_boarding}</p>
                </div>
                <div className="p-2 bg-pink-100 rounded-full">
                  <svg className="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-red-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">On Hold</h3>
                  <p className="text-2xl font-bold text-red-600 mt-1">{stats.on_hold}</p>
                </div>
                <div className="p-2 bg-red-100 rounded-full">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-gray-500 xl:col-span-1 xl:col-start-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Closed</h3>
                  <p className="text-2xl font-bold text-gray-600 mt-1">{stats.closed}</p>
                </div>
                <div className="p-2 bg-gray-100 rounded-full">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section Divider */}
        <div className="border-t border-gray-200 my-6"></div>

        {/* Quick Status Filters */}
        <div className="flex flex-wrap gap-1 mb-4">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filterStatus === 'all' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            All ({requirements.length})
          </button>
          <button
            onClick={() => {
              setFilterStatus('open')
              const newFilters = { ...appliedFilters, status: 'open' }
              setAppliedFilters(newFilters)
              setCurrentPage(1)
              fetchTrackerData(1, newFilters)
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filterStatus === 'open' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Open ({stats?.open || 0})
          </button>
          <button
            onClick={() => {
              setFilterStatus('candidate submission')
              const newFilters = { ...appliedFilters, status: 'candidate submission' }
              setAppliedFilters(newFilters)
              setCurrentPage(1)
              fetchTrackerData(1, newFilters)
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filterStatus === 'candidate submission' 
                ? 'bg-purple-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Candidate Submission ({stats?.candidate_submission || 0})
          </button>
          <button
            onClick={() => {
              setFilterStatus('interview scheduled')
              const newFilters = { ...appliedFilters, status: 'interview scheduled' }
              setAppliedFilters(newFilters)
              setCurrentPage(1)
              fetchTrackerData(1, newFilters)
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filterStatus === 'interview scheduled' 
                ? 'bg-orange-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Interview Scheduled ({stats?.interview_scheduled || 0})
          </button>
          <button
            onClick={() => {
              setFilterStatus('offer recommendation')
              const newFilters = { ...appliedFilters, status: 'offer recommendation' }
              setAppliedFilters(newFilters)
              setCurrentPage(1)
              fetchTrackerData(1, newFilters)
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filterStatus === 'offer recommendation' 
                ? 'bg-indigo-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Offer Recommendation ({stats?.offer_recommendation || 0})
          </button>
          <button
            onClick={() => {
              setFilterStatus('on boarding')
              const newFilters = { ...appliedFilters, status: 'on boarding' }
              setAppliedFilters(newFilters)
              setCurrentPage(1)
              fetchTrackerData(1, newFilters)
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filterStatus === 'on boarding' 
                ? 'bg-pink-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            On boarding ({stats?.on_boarding || 0})
          </button>
          <button
            onClick={() => {
              setFilterStatus('on hold')
              const newFilters = { ...appliedFilters, status: 'on hold' }
              setAppliedFilters(newFilters)
              setCurrentPage(1)
              fetchTrackerData(1, newFilters)
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filterStatus === 'on hold' 
                ? 'bg-red-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            On Hold ({stats?.on_hold || 0})
          </button>
          <button
            onClick={() => {
              setFilterStatus('closed')
              fetchClosedRequirements()
            }}
            disabled={loadingClosed}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filterStatus === 'closed' 
                ? 'bg-gray-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            } ${loadingClosed ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loadingClosed ? 'Loading...' : `Closed (${stats?.closed || 0})`}
          </button>
          {/* Archived button - Only visible to admins */}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => {
                setShowArchived(!showArchived)
                if (!showArchived) {
                  fetchArchivedRequirements()
                }
                setFilterStatus('all') // Reset other filters when viewing archived
              }}
              disabled={loadingArchived && !showArchived}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                showArchived 
                  ? 'bg-orange-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              } ${loadingArchived && !showArchived ? 'opacity-50 cursor-wait' : ''}`}
            >
              {loadingArchived && !showArchived ? 'Loading...' : showArchived ? 'Show Active' : `Archived (${archivedRequirements.length})`}
            </button>
          )}
        </div>

        {/* Advanced Filters Toggle */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select
                  value={filters.status === 'all' 
                    ? { value: 'all', label: 'All Statuses' }
                    : filters.status 
                      ? { value: filters.status, label: filters.status.charAt(0).toUpperCase() + filters.status.slice(1) }
                      : null}
                  onChange={(selected) => handleFilterChange('status', selected?.value || 'all')}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    ...statusOptions.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))
                  ]}
                  isSearchable={true}
                  placeholder="Select status..."
                  className="text-sm"
                  styles={selectStyles}
                />
              </div>

              {/* Company Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
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

              {/* Department Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <Select
                  value={filters.department === 'all'
                    ? { value: 'all', label: 'All Departments' }
                    : filters.department
                      ? { value: filters.department, label: filters.department }
                      : null}
                  onChange={(selected) => handleFilterChange('department', selected?.value || 'all')}
                  options={[
                    { value: 'all', label: 'All Departments' },
                    ...departmentOptions.map(d => ({ value: d, label: d }))
                  ]}
                  isSearchable={true}
                  placeholder="Select department..."
                  className="text-sm"
                  styles={selectStyles}
                />
              </div>

              {/* Location Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <Select
                  value={filters.location === 'all'
                    ? { value: 'all', label: 'All Locations' }
                    : filters.location
                      ? { value: filters.location, label: filters.location }
                      : null}
                  onChange={(selected) => handleFilterChange('location', selected?.value || 'all')}
                  options={[
                    { value: 'all', label: 'All Locations' },
                    ...locationOptions.map(l => ({ value: l, label: l }))
                  ]}
                  isSearchable={true}
                  placeholder="Select location..."
                  className="text-sm"
                  styles={selectStyles}
                />
              </div>

            </div>

            {/* Filter Action Buttons */}
            <div className="flex justify-end space-x-3 mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
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
        <div className="mb-4 text-sm text-gray-600">
          {filtersActive ? (
            <span>
              Showing {totalItems === 0 ? 0 : startIndex + 1}-{endIndex} of {totalItems} requirements
              <span className="text-blue-600"> (filtered)</span>
            </span>
          ) : (
            <span>
              Showing {displayRequirements.length} most recent requirements
              {displayRequirements.length === PAGE_SIZE && <span className="text-gray-500"> (apply filters to see all)</span>}
            </span>
          )}
        </div>
      </div>

      {/* Requirements Table */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Requirements</h2>
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
              onClick={() => fetchTrackerData(currentPage, appliedFilters)}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          {loadingTable ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading requirements...</p>
              </div>
            </div>
          ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                {showArchived ? (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Request ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Job Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Archived Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Archived By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </>
                ) : filterStatus === 'closed' ? (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Request ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Overall Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recruiters
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Profiles
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Selected Profiles
                    </th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Request ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date Received
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Job Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Edit
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedRequirements.map((req) => (
                <tr key={req.request_id} className="hover:bg-gray-50">
                  {showArchived ? (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {req.request_id}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {req.job_title || req.email_subject}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {req.company_name || req.sender_name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {formatDate(req.deleted_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {req.deleted_by_name || req.deleted_by || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => restoreRequirement(req.request_id)}
                          className="text-green-600 hover:text-green-900 mr-3"
                          title="Restore Requirement"
                        >
                          <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          Restore
                        </button>
                      </td>
                    </>
                  ) : filterStatus === 'closed' ? (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {req.request_id}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {req.overall_time || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                            <div className="flex flex-wrap gap-1">
                            {(() => {
                              const raw = Array.isArray(req.assigned_recruiters)
                                ? req.assigned_recruiters
                                : String(
                                    (req.recruiter_name ?? req.recruiters ?? req.assigned_to ?? '')
                                  )
                                    .split(',')
                                    .map((v: string) => v.trim())
                                    .filter(Boolean);
                              return raw.length > 0
                                ? raw.map((name: string) => (
                                    <span key={name} className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                      {name}
                                    </span>
                                  ))
                                : <span className="text-gray-500">Unassigned</span>;
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            {req.profiles_count || 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-pink-100 text-pink-800">
                            {req.selected_profiles_count || 0}
                          </span>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                                          <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleRequestIdClick(req.request_id)}
                          className={`text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline ${
                            normalizeStatus(req.status) === 'on hold' && currentUser?.role === 'recruiter' 
                              ? 'cursor-not-allowed opacity-50' 
                              : 'cursor-pointer'
                          }`}
                          disabled={normalizeStatus(req.status) === 'on hold' && currentUser?.role === 'recruiter'}
                          title={normalizeStatus(req.status) === 'on hold' && currentUser?.role === 'recruiter' 
                            ? 'This requirement is on hold. Only administrators can access it.' 
                            : 'Click to view emails'
                          }
                        >
                          {req.request_id}
                        </button>
                        {req.is_manual_requirement && (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800" title="Manually added requirement">
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                            </svg>
                            Manual
                          </span>
                        )}
                      </div>
                    </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(req.received_datetime)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {req.job_title || req.email_subject}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {req.company_name || req.sender_name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(req.status)}`}>
                            {getStatusDisplayName(req.status)}
                          </span>
                          {/* {req.status === 'On Hold' && (
                            <span className="ml-2 text-xs text-red-600 font-medium">
                              (Admin Only)
                            </span>
                          )} */}
                        </div>
                        {req.detected_category && (
                          <span className="ml-1 text-xs text-gray-500" title="Automatically detected from email content">
                            (auto)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {req.priority ? (
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            req.priority === 'Urgent' ? 'bg-red-200 text-red-900' :
                            req.priority === 'High' ? 'bg-red-100 text-red-800' :
                            req.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                            req.priority === 'Low' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {req.priority}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <div className="flex flex-wrap gap-1">
                            {(req.assigned_recruiters || []).length > 0 ? (
                              req.assigned_recruiters.map((recruiter) => (
                                <span
                                  key={recruiter}
                                  className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800"
                                >
                                  {recruiter}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-500">Unassigned</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => {
                            setSelectedRequirement(req)
                            setShowModal(true)
                          }}
                          disabled={req.status === 'On Hold' && currentUser?.role === 'recruiter'}
                          className={`text-indigo-600 hover:text-indigo-900 ${
                            normalizeStatus(req.status) === 'on hold' && currentUser?.role === 'recruiter' 
                              ? 'cursor-not-allowed opacity-50' 
                              : 'cursor-pointer'
                          }`}
                          title={normalizeStatus(req.status) === 'on hold' && currentUser?.role === 'recruiter' 
                            ? 'Cannot edit on-hold requirements' 
                            : 'Edit requirement'
                          }
                        >
                          Edit Details
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Pagination Controls - Only show when filters are active */}
      {totalItems > 0 && filtersActive && !showArchived && filterStatus !== 'closed' && (
        <div className="flex items-center justify-center px-4 py-3 bg-white border border-t-0 rounded-b-lg shadow">
          <div className="flex items-center gap-1">
            {/* Prev */}
            <button
              aria-label="Previous page"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`w-8 h-8 flex items-center justify-center rounded-full ${currentPage === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L8.414 10l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/></svg>
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
                      p === currentPage ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={`e-${idx}`} className="px-2 text-gray-400 select-none">{p}</span>
                )
              ))
            })()}

            {/* Next */}
            <button
              aria-label="Next page"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={`w-8 h-8 flex items-center justify-center rounded-full ${currentPage === totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 4.293a1 1 0 011.414 0L14 9.586a1 1 0 010 1.414l-5.293 5.293a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
            </button>
          </div>
        </div>
      )}

      {!loadingTable && paginatedRequirements.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No requirements found for the selected filter.</p>
        </div>
      )}

      {/* Modal for requirement details */}
      {showModal && selectedRequirement && (
        <RequirementModal
          requirement={selectedRequirement}
          onClose={() => setShowModal(false)}
          onUpdate={updateRequirement}
          getStatusColor={getStatusColor}
          showViewJDModal={showViewJDModal}
          setShowViewJDModal={setShowViewJDModal}
          companyOptions={companyOptions}
        />
      )}


    </div>
  )
}

interface RequirementModalProps {
  requirement: TrackerRequirement
  onClose: () => void
  onUpdate: (requestId: string, updates: Partial<TrackerRequirement>) => void
  getStatusColor: (status: string) => string
  showViewJDModal: boolean
  setShowViewJDModal: (show: boolean) => void
  companyOptions: string[]
}

const RequirementModal: React.FC<RequirementModalProps> = ({ requirement, onClose, onUpdate, getStatusColor, showViewJDModal, setShowViewJDModal, companyOptions }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  
  // Get current user from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser)
        setCurrentUser(userData)
      } catch (error) {
        console.error('Error parsing user data:', error)
      }
    }
  }, [])
  
  // Form state for all editable fields
  const [formData, setFormData] = useState({
    job_title: requirement.job_title || '',
    company_name: requirement.company_name || '',
    department: requirement.department || '',
    location: requirement.location || '',
    shift: requirement.shift || '',
    job_type: requirement.job_type || '',
    hiring_manager: requirement.hiring_manager || '',
    experience_range: requirement.experience_range || '',
    skills_required: requirement.skills_required || '',
    minimum_qualification: requirement.minimum_qualification || '',
    number_of_positions: requirement.number_of_positions || '',
    budget_ctc: requirement.budget_ctc || '',
    priority: requirement.priority || '',
    tentative_doj: requirement.tentative_doj || '',
    additional_remarks: requirement.additional_remarks || '',
    status: requirement.status || 'Open',
    assigned_to: requirement.assigned_to || '',
    notes: requirement.notes || ''
  })

  const statusOptions = [
    { value: 'Open', display: 'Open' },
    { value: 'Candidate_Submission', display: 'Candidate Submission' },
    { value: 'Interview_Scheduled', display: 'Interview Scheduled' },
    { value: 'Offer_Recommendation', display: 'Offer Recommendation' },
    { value: 'On_Boarding', display: 'On Boarding' },
    { value: 'On_Hold', display: 'On Hold' },
    { value: 'Closed', display: 'Closed' }
  ]

  // Filter status options based on user role
  const getAvailableStatusOptions = () => {
    if (currentUser?.role === 'admin') {
      return statusOptions // Admins can see all status options
    } else {
      // Recruiters cannot see "On Hold" option
      return statusOptions.filter(status => status.value !== 'On_Hold')
    }
  }

  // Dynamic enum options state - loaded from backend
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([])
  const [shiftOptions, setShiftOptions] = useState<string[]>([])
  const [jobTypeOptions, setJobTypeOptions] = useState<string[]>([])
  const [priorityOptions, setPriorityOptions] = useState<string[]>([])

  // Load enum values from backend on mount
  useEffect(() => {
    const loadEnumValues = async () => {
      try {
        // Load all enum types
        const [deptRes, shiftRes, jobTypeRes, priorityRes] = await Promise.all([
          api.get('/get-enum-values?enum_type=department'),
          api.get('/get-enum-values?enum_type=shift'),
          api.get('/get-enum-values?enum_type=job_type'),
          api.get('/get-enum-values?enum_type=priority')
        ])

        if (deptRes?.success && Array.isArray(deptRes.values)) {
          const sortedDept = [...deptRes.values].sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          setDepartmentOptions(sortedDept)
        }
        if (shiftRes?.success && Array.isArray(shiftRes.values)) {
          setShiftOptions(shiftRes.values)
        }
        if (jobTypeRes?.success && Array.isArray(jobTypeRes.values)) {
          setJobTypeOptions(jobTypeRes.values)
        }
        if (priorityRes?.success && Array.isArray(priorityRes.values)) {
          setPriorityOptions(priorityRes.values)
        }
      } catch (error) {
        console.error('Error loading enum values:', error)
      }
    }

    loadEnumValues()
  }, [])

  const formatEnumDisplay = (value?: string) => {
    if (!value) return ''
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'number_of_positions' ? (value === '' ? null : Number(value)) : 
               field === 'tentative_doj' ? (value === '' ? null : value) : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check if requirement is on hold and user is a recruiter
    if (requirement.status === 'On Hold' && currentUser?.role === 'recruiter') {
      alert('Cannot modify on-hold requirements. Only administrators can modify on-hold requirements.')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // Convert formData to match TrackerRequirement interface
      const updateData: Partial<TrackerRequirement> = {
        ...formData,
        number_of_positions: formData.number_of_positions === '' ? undefined : Number(formData.number_of_positions),
        tentative_doj: formData.tentative_doj === '' ? undefined : formData.tentative_doj
      }
      await onUpdate(requirement.request_id, updateData)
    } catch (error) {
      console.error('Error in form submission:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await api.delete(`/tracker/${requirement.request_id}`)
      if (response) {
        // Close modal and refresh the page or parent component
        onClose()
        // Trigger a page refresh to update the data
        window.location.reload()
      }
    } catch (error) {
      console.error('Error archiving requirement:', error)
      alert('Failed to archive requirement. Please try again.')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              {requirement.request_id} - Edit Requirement Details
            </h2>
            <div className="flex items-center space-x-2">
              {/* Delete Button - Only visible to admins */}
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 transition-colors"
                  title="Archive Requirement"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H8a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Read-only information */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email Subject</label>
              <p className="mt-1 text-sm text-gray-900">{requirement.email_subject}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Sender</label>
              <p className="mt-1 text-sm text-gray-900">
                {requirement.sender_name} ({requirement.sender_email})
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Received Date</label>
              <p className="mt-1 text-sm text-gray-900">
                {requirement.received_datetime ? new Date(requirement.received_datetime).toLocaleString() : 'N/A'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Current Status</label>
              <p className="mt-1 text-sm text-gray-900">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(requirement.status)}`}>
                  {getStatusDisplayName(requirement.status)}
                </span>
                {requirement.detected_category && (
                  <span className="ml-2 text-xs text-gray-500">
                    (Automatically detected from email content: {requirement.detected_category.replace('_', ' ')})
                  </span>
                )}
              </p>
      {normalizeStatus(requirement.status) === 'on hold' && currentUser?.role === 'recruiter' && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Requirement On Hold
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>This requirement is currently on hold. Only administrators can modify on-hold requirements.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Job Details Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Job Details</h3>
                {requirement.jd_path && (
                  <button
                    onClick={() => setShowViewJDModal(true)}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    View JD
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Job Title *</label>
                  <input
                    type="text"
                    value={formData.job_title}
                    onChange={(e) => handleInputChange('job_title', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter job title"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Company *</label>
                  <select
                    value={formData.company_name}
                    onChange={(e) => handleInputChange('company_name', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select company</option>
                    {companyOptions.map((company) => (
                      <option key={company} value={company}>
                        {formatEnumDisplay(company)}
                      </option>
                    ))}
                    {formData.company_name && !companyOptions.includes(formData.company_name) && (
                      <option value={formData.company_name}>
                        {formatEnumDisplay(formData.company_name)}
                      </option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Department</label>
                <select
                  value={formData.department}
                  onChange={(e) => handleInputChange('department', e.target.value)}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select department</option>
                  {departmentOptions.map((dept) => (
                    <option key={dept} value={dept}>
                      {formatEnumDisplay(dept)}
                    </option>
                  ))}
                </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter location"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Job Type</label>
                  <select
                    value={formData.job_type}
                    onChange={(e) => handleInputChange('job_type', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select job type</option>
                    {jobTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatEnumDisplay(option)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Shift</label>
                <select
                  value={formData.shift}
                  onChange={(e) => handleInputChange('shift', e.target.value)}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select shift</option>
                  {shiftOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatEnumDisplay(option)}
                    </option>
                  ))}
                </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Experience Range</label>
                  <input
                    type="text"
                    value={formData.experience_range}
                    onChange={(e) => handleInputChange('experience_range', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 3-5 years"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Number of Positions</label>
                  <input
                    type="number"
                    value={formData.number_of_positions}
                    onChange={(e) => handleInputChange('number_of_positions', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter number of positions"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Budget CTC</label>
                  <input
                    type="text"
                    value={formData.budget_ctc}
                    onChange={(e) => handleInputChange('budget_ctc', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 8-12 LPA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => handleInputChange('priority', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select priority</option>
                    {priorityOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatEnumDisplay(option)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tentative DOJ</label>
                  <input
                    type="date"
                    value={formData.tentative_doj}
                    onChange={(e) => handleInputChange('tentative_doj', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Hiring Manager</label>
                <input
                  type="text"
                  value={formData.hiring_manager}
                  onChange={(e) => handleInputChange('hiring_manager', e.target.value)}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter hiring manager name"
                />
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Skills Required</label>
                <textarea
                  value={formData.skills_required}
                  onChange={(e) => handleInputChange('skills_required', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter required skills"
                />
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Minimum Qualification</label>
                <textarea
                  value={formData.minimum_qualification}
                  onChange={(e) => handleInputChange('minimum_qualification', e.target.value)}
                  rows={2}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter minimum qualification"
                />
              </div>
            </div>

            {/* Tracker Management Section */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Tracker Management</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {getAvailableStatusOptions().map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>
                {/* <div>
                  <label className="block text-sm font-medium text-gray-700">Assigned To</label>
                  <input
                    type="text"
                    value={formData.assigned_to}
                    onChange={(e) => handleInputChange('assigned_to', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter assignee name"
                  />
                </div> */}
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add notes..."
                />
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Additional Remarks</label>
                <textarea
                  value={formData.additional_remarks}
                  onChange={(e) => handleInputChange('additional_remarks', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add additional remarks..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (normalizeStatus(requirement.status) === 'on hold' && currentUser?.role === 'recruiter')}
                className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    isSubmitting || (normalizeStatus(requirement.status) === 'on hold' && currentUser?.role === 'recruiter')
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  }`}
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    Archive Requirement
                  </h3>
                </div>
              </div>
              <div className="mb-4">
                <p className="text-sm text-gray-700">
                  Are you sure you want to archive requirement <strong>{requirement.request_id}</strong>? 
                  This will move the requirement to the archive where it can be restored later if needed. 
                  All associated data will be preserved.
                </p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-700">
                    <strong>Note:</strong> Archived requirements can be restored by administrators at any time.
                  </p>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? (
                    <div className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Archiving...
                    </div>
                  ) : (
                    'Archive Requirement'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Description Modal */}
      <JobDescriptionModal
        isOpen={showViewJDModal}
        onClose={() => setShowViewJDModal(false)}
        jobTitle={requirement.job_title}
        companyName={requirement.company_name || 'Unknown Company'}
        fileName={requirement.job_file_name || 'Job Description'}
        filePath={requirement.jd_path || ''}
      />
    </div>
  )
}

export default TrackerPage 