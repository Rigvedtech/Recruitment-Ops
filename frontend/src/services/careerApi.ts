/**
 * Career Portal API Service
 * 
 * Handles all API calls for the public career portal.
 * No authentication required for browsing jobs.
 * 
 * Endpoints:
 * - GET /api/careers/jobs - List jobs with pagination, filters, search
 * - GET /api/careers/jobs/:id - Get single job details
 * - GET /api/careers/filters - Get filter options
 * - GET /api/careers/search-suggestions - Autocomplete
 * - GET /api/careers/stats - Portal statistics
 * - GET /api/careers/featured - Featured jobs
 */

// Types
export interface Job {
  request_id: string;
  job_title: string;
  department: string | null;
  location: string | null;
  company_name: string | null;
  job_type: string | null;
  shift: string | null;
  experience_range: string | null;
  number_of_positions: number | null;
  priority: string | null;
  status: string;
  posted_date: string | null;
  posted_date_relative: string | null;
  is_new: boolean;
  is_urgent: boolean;
}

export interface JobDetails extends Job {
  job_description: string | null;
  minimum_qualification: string | null;
  budget_ctc: string | null;
  hiring_manager: string | null;
  additional_remarks: string | null;
  tentative_doj: string | null;
  jd_file_name: string | null;
  created_at: string | null;
}

export interface PaginationInfo {
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface JobsFilters {
  search?: string;
  location?: string;
  department?: string;
  job_type?: string;
  experience?: string;
  company?: string;
  status?: string;
  posted_within?: string;
  shift?: string;
  sort_by?: string;
  page?: number;
  per_page?: number;
}

export interface FilterOptions {
  locations: string[];
  departments: string[];
  job_types: string[];
  companies: string[];
  experience_ranges: string[];
  shifts: string[];
  posted_within_options: { value: string; label: string }[];
  sort_options: { value: string; label: string }[];
}

export interface SearchSuggestion {
  type: 'job_title' | 'location' | 'department';
  value: string;
  label: string;
  icon: string;
}

export interface PortalStats {
  total_jobs: number;
  total_locations: number;
  total_departments: number;
  recent_jobs: number;
  jobs_by_department: { department: string; count: number }[];
  jobs_by_location: { location: string; count: number }[];
}

// API Base URL - follows the same pattern as main api.ts
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const domain = window.location.host;
    if (domain.includes('rgvdit-rops') || domain.includes('finquest-rops')) {
      return 'http://20.188.122.171:1976';
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976';
};

/**
 * Build API URL with proper /api prefix handling.
 * Handles cases where NEXT_PUBLIC_API_URL may or may not include /api suffix.
 */
const getApiUrl = (endpoint: string) => {
  const baseUrl = getApiBaseUrl();
  // If baseUrl already ends with /api, don't add it again
  if (baseUrl.endsWith('/api')) {
    return `${baseUrl}/careers${endpoint}`;
  }
  return `${baseUrl}/api/careers${endpoint}`;
};

// Get domain header for multi-tenant support
const getDomainHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (typeof window !== 'undefined') {
    headers['X-Original-Domain'] = window.location.host;
  }
  
  return headers;
};

/**
 * Fetch jobs with filters and pagination
 */
export async function fetchJobs(filters: JobsFilters = {}): Promise<{
  jobs: Job[];
  pagination: PaginationInfo;
  filters_applied: Record<string, string | null>;
}> {
  const params = new URLSearchParams();
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, value.toString());
    }
  });
  
  const url = `${getApiUrl('/jobs')}${params.toString() ? `?${params.toString()}` : ''}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: getDomainHeaders(),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch jobs');
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch jobs');
  }
  
  return data.data;
}

/**
 * Fetch single job details
 */
export async function fetchJobDetails(requestId: string): Promise<{
  job: JobDetails;
  related_jobs: Job[];
}> {
  const response = await fetch(getApiUrl(`/jobs/${requestId}`), {
    method: 'GET',
    headers: getDomainHeaders(),
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Job not found');
    }
    throw new Error('Failed to fetch job details');
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch job details');
  }
  
  return data.data;
}

/**
 * Fetch filter options
 */
export async function fetchFilterOptions(): Promise<FilterOptions> {
  const response = await fetch(getApiUrl('/filters'), {
    method: 'GET',
    headers: getDomainHeaders(),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch filter options');
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch filter options');
  }
  
  return data.data;
}

/**
 * Fetch search suggestions (autocomplete)
 */
export async function fetchSearchSuggestions(
  query: string,
  limit: number = 10
): Promise<SearchSuggestion[]> {
  if (query.length < 2) {
    return [];
  }
  
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
  });
  
  const response = await fetch(getApiUrl(`/search-suggestions?${params.toString()}`), {
    method: 'GET',
    headers: getDomainHeaders(),
  });
  
  if (!response.ok) {
    return [];
  }
  
  const data = await response.json();
  
  if (!data.success) {
    return [];
  }
  
  return data.data.suggestions;
}

/**
 * Fetch portal statistics
 */
export async function fetchPortalStats(): Promise<PortalStats> {
  const response = await fetch(getApiUrl('/stats'), {
    method: 'GET',
    headers: getDomainHeaders(),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch portal stats');
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch portal stats');
  }
  
  return data.data;
}

/**
 * Fetch featured jobs
 */
export async function fetchFeaturedJobs(limit: number = 6): Promise<Job[]> {
  const response = await fetch(getApiUrl(`/featured?limit=${limit}`), {
    method: 'GET',
    headers: getDomainHeaders(),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch featured jobs');
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch featured jobs');
  }
  
  return data.data.jobs;
}

// Debounce utility for search
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

