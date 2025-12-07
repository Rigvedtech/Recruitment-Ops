import axios, { AxiosError } from 'axios';
import { Email } from '../types/student';

interface StudentFilters {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
}

// Get current domain
const getCurrentDomain = () => {
    if (typeof window !== 'undefined') {
        return window.location.host;
    }
    return 'localhost:3000';
};

// Get API base URL based on domain
const getApiBaseUrl = () => {
    const domain = getCurrentDomain();
    if (domain.includes('rgvdit-rops') || domain.includes('finquest-rops')) {
        return 'http://20.188.122.171:1976';
    }
    return process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976';
};

// Helper function to get API URL with proper /api prefix
const getApiUrl = (endpoint: string) => {
    const baseUrl = getApiBaseUrl();
    // If baseUrl already ends with /api, don't add it again
    if (baseUrl.endsWith('/api')) {
        return `${baseUrl}${endpoint}`;
    }
    return `${baseUrl}/api${endpoint}`;
};

const API_BASE_URL = getApiBaseUrl();

// --- Global session-expired handling ---
const dispatchSessionExpired = (detail?: { reason?: string; status?: number }) => {
    if (typeof window === 'undefined') return;
    try {
        const event = new CustomEvent('session-expired', { detail });
        window.dispatchEvent(event);
    } catch {
        // Fallback: dispatch a simple Event if CustomEvent is unavailable
        window.dispatchEvent(new Event('session-expired'));
    }
};

// Wrap window.fetch to catch 401 invalid/expired token responses across the app
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
        const response = await originalFetch(...args as Parameters<typeof originalFetch>);
        if (response && response.status === 401) {
            try {
                // Clone to avoid locking the body for callers
                const clone = response.clone();
                const data = await clone.json().catch(() => ({} as any));
                const message = (data && (data.message || data.error)) || '';
                if (typeof message === 'string' && message.toLowerCase().includes('invalid or expired token')) {
                    dispatchSessionExpired({ reason: 'token_expired', status: 401 });
                }
            } catch {
                // Ignore JSON parsing issues
            }
        }
        return response;
    };
}

// Helper function to get auth headers with domain
const getAuthHeaders = () => {
    const domain = getCurrentDomain();
    const headers: Record<string, string> = {
        'X-Original-Domain': domain,
        'Content-Type': 'application/json',
    };

    if (typeof window !== 'undefined') {
        const user = localStorage.getItem('user');
        if (user) {
            try {
                const userData = JSON.parse(user);
                // Use access_token (JWT) if available, fallback to username for backwards compatibility
                const token = localStorage.getItem('access_token');
                headers['Authorization'] = `Bearer ${token || userData.access_token || userData.username}`;
            } catch (e) {
                console.error('Error parsing user data:', e);
            }
        }
    }
    return headers;
};

// Configure axios
const axiosApi = axios.create({
    baseURL: getApiUrl(''),
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add request interceptor to include auth headers and domain
axiosApi.interceptors.request.use(
    (config) => {
        const authHeaders = getAuthHeaders();
        // Add domain header
        config.headers['X-Original-Domain'] = authHeaders['X-Original-Domain'];
        // Add authorization header if present
        if ('Authorization' in authHeaders && authHeaders.Authorization) {
            config.headers.Authorization = authHeaders.Authorization;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor for error handling
axiosApi.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        console.error('API Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
            
            if (error.response.status === 401) {
                try {
                    const data: any = error.response.data || {};
                    const message = (data.message || data.error || '').toString().toLowerCase();
                    if (message.includes('invalid or expired token')) {
                        dispatchSessionExpired({ reason: 'token_expired', status: 401 });
                    }
                } catch {}
                error.message = 'Authentication failed. Please log in again.';
            }
        }
        return Promise.reject(error);
    }
);

interface EmailResponse {
    status: 'success' | 'error';
    message: string;
    all_emails?: Email[];
}

export async function fetchEmails() {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl('/emails/all'), {
        headers
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch emails: ${response.statusText}`);
    }
    return response.json();
}

export async function getEmailRefreshStatus() {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl('/email-refresh-status'), {
        headers
    });
    if (!response.ok) {
        throw new Error(`Failed to get refresh status: ${response.statusText}`);
    }
    return response.json();
}

export async function fetchLatestEmails() {
    try {
        const response = await axiosApi.get('/get-latest-mails');
        return response.data;
    } catch (error) {
        console.error('Error fetching latest emails:', error);
        throw error;
    }
}

export async function fetchRecruiterEmails() {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl('/emails/recruiter'), {
        headers
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch recruiter emails: ${response.statusText}`);
    }
    return response.json();
}

export async function fetchEmailsForRequest(requestId: string) {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl(`/tracker/emails/${requestId}`), {
        headers
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch emails for request ${requestId}: ${response.statusText}`);
    }
    return response.json();
}

export const getStudents = async (filters?: StudentFilters) => {
    try {
        const response = await axiosApi.get('/students', { params: filters });
        return response.data;
    } catch (error) {
        console.error('Error getting students:', error);
        throw error;
    }
};

// Reports and enums helpers
export const getEnumValues = async (enumType: 'company' | 'department' | 'shift' | 'job_type' | 'priority') => {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl(`/get-enum-values?enum_type=${enumType}`), { headers });
    if (!response.ok) {
        throw new Error('Failed to fetch enum values');
    }
    return response.json();
};

export const getRecruitmentReport = async (params: { date_from?: string; date_to?: string; company?: string }) => {
    const headers = getAuthHeaders();
    const search = new URLSearchParams();
    if (params.date_from) search.append('date_from', params.date_from);
    if (params.date_to) search.append('date_to', params.date_to);
    if (params.company) search.append('company', params.company);
    const qs = search.toString() ? `?${search.toString()}` : '';
    const response = await fetch(getApiUrl(`/reports/recruitment${qs}`), { headers });
    if (!response.ok) {
        throw new Error('Failed to generate report');
    }
    return response.json();
};

export const getInternalTrackerReport = async (params: { date_from?: string; date_to?: string }) => {
    const headers = getAuthHeaders();
    const search = new URLSearchParams();
    if (params.date_from) search.append('date_from', params.date_from);
    if (params.date_to) search.append('date_to', params.date_to);
    const qs = search.toString() ? `?${search.toString()}` : '';
    const response = await fetch(getApiUrl(`/reports/internal-tracker${qs}`), { headers });
    if (!response.ok) {
        throw new Error('Failed to generate report');
    }
    return response.json();
};

export const getStudent = async (id: number) => {
    try {
        const response = await axiosApi.get(`/students/${id}`);
        return response.data;
    } catch (error) {
        console.error('Error getting student:', error);
        throw error;
    }
};

export const exportStudents = async (filters?: StudentFilters) => {
    try {
        const response = await axiosApi.get('/students/export', {
            params: filters,
            responseType: 'blob',
        });
        
        // Check if the response is JSON (error) instead of a blob
        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('application/json')) {
            // Convert blob to text to read the error message
            const text = await response.data.text();
            const error = JSON.parse(text);
            throw new Error(error.message || 'Failed to export data');
        }
        
        return response.data;
    } catch (error) {
        console.error('Error exporting students:', error);
        throw error;
    }
};

export const exportToExcel = async (emails: Email[]) => {
    try {
        const response = await axiosApi.post('/emails/export', { emails });
        return response.data;
    } catch (error: any) {
        console.error('Error exporting to Excel:', error);
        if (error.response?.status === 401) {
            throw new Error('Authentication failed. Please check your Microsoft Graph configuration.');
        }
        throw error;
    }
};

export const getExportFileUrl = (filename: string) => {
    return getApiUrl(`/exports/${filename}`);
};

export async function exportEmails(emails: any[]) {
    const response = await fetch(getApiUrl('/emails/export'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emails }),
    });
    if (!response.ok) {
        throw new Error(`Failed to export emails: ${response.statusText}`);
    }
    return response.json();
}

export async function fetchStudentData() {
    const response = await fetch(getApiUrl('/students'), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch student data');
    }

    return response.json();
} 

export async function fetchProfilesData(filters?: {
    search?: string;
    experience_min?: number;
    experience_max?: number;
    ctc_min?: number;
    ctc_max?: number;
    location?: string;
    company?: string;
    page?: number;
    per_page?: number;
}) {
    const params = new URLSearchParams();
    
    if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                params.append(key, value.toString());
            }
        });
    }
    
    const url = getApiUrl(`/profiles${params.toString() ? `?${params.toString()}` : ''}`);
    const headers = getAuthHeaders();
    
    const response = await fetch(url, {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        throw new Error('Failed to fetch profiles data');
    }

    return response.json();
} 

// Tracker API methods
export async function fetchTrackerRequirements() {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl('/tracker'), {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        throw new Error('Failed to fetch tracker requirements');
    }

    return response.json();
}

export async function fetchTrackerStats() {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl('/tracker/stats'), {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        throw new Error('Failed to fetch tracker stats');
    }

    return response.json();
}

export async function fetchTrackerRequirement(requestId: string) {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl(`/tracker/${requestId}`), {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        throw new Error('Failed to fetch tracker requirement');
    }

    return response.json();
}

export async function updateTrackerRequirement(requestId: string, updates: any) {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl(`/tracker/${requestId}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
    });

    if (!response.ok) {
        throw new Error('Failed to update tracker requirement');
    }

    return response.json();
}

// Login function that includes domain header
export async function login(username: string, password: string) {
    const domain = getCurrentDomain();
    console.log('Attempting login with:', { username, password, domain });
    console.log('API URL:', getApiUrl('/login'));
    
    const response = await fetch(getApiUrl('/login'), {
        method: 'POST',
        headers: {
            'X-Original-Domain': domain,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);

    if (!response.ok) {
        const errorText = await response.text();
        console.log('Error response body:', errorText);
        throw new Error(`Invalid credentials.Check username or password`);
    }

    const data = await response.json();
    console.log('Login response:', data);
    return data;
}

// Recruiter login function that includes domain header
export async function recruiterLogin(username: string, password: string) {
    const domain = getCurrentDomain();
    const response = await fetch(getApiUrl('/recruiter/login'), {
        method: 'POST',
        headers: {
            'X-Original-Domain': domain,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
        throw new Error(`Failed to post to /recruiter/login`);
    }

    return response.json();
}

// Update user profile function
export async function updateUserProfile(updateData: {
    full_name?: string;
    username?: string;
    phone_number?: string;
    password?: string;
    current_password?: string;
}) {
    const headers = getAuthHeaders();
    const response = await fetch(getApiUrl('/auth/current-user'), {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateData),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update profile');
    }

    return response.json();
}

// Forgot password - send OTP
export async function forgotPassword(email: string) {
    const domain = getCurrentDomain();
    const response = await fetch(getApiUrl('/auth/forgot-password'), {
        method: 'POST',
        headers: {
            'X-Original-Domain': domain,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to send password reset OTP');
    }

    return response.json();
}

// Reset password with OTP
export async function resetPassword(email: string, otp: string, newPassword: string) {
    const domain = getCurrentDomain();
    const response = await fetch(getApiUrl('/auth/reset-password'), {
        method: 'POST',
        headers: {
            'X-Original-Domain': domain,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp, new_password: newPassword }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to reset password');
    }

    return response.json();
}

// Unified API object for easier use
export const api = {
    get: async (endpoint: string) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl(endpoint), {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch ${endpoint}`);
        }

        return response.json();
    },

    getRecruiterActivity: async (days: number = 7) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl(`/recruiter-activity?days=${days}`), {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch recruiter activity`);
        }

        return response.json();
    },

    getRequirementsActivity: async () => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/requirements-activity'), {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch requirements activity`);
        }

        return response.json();
    },

    createRequirement: async (requirementData: any) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/requirements'), {
            method: 'POST',
            headers,
            body: JSON.stringify(requirementData),
        });

        const responseData = await response.json();
        
        // Check if this is a duplicate requirement response
        if (responseData.has_duplicates !== undefined) {
            // This is a duplicate requirement response, return it normally
            return responseData;
        }

        if (!response.ok) {
            throw new Error(responseData.error || `Failed to create requirement`);
        }

        return responseData;
    },

    checkRequirementDuplicate: async (requirementData: any) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/requirements/check-duplicate'), {
            method: 'POST',
            headers,
            body: JSON.stringify(requirementData),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to check for duplicates`);
        }

        return response.json();
    },

    forceCreateRequirement: async (requirementData: any) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/requirements/force-create'), {
            method: 'POST',
            headers,
            body: JSON.stringify(requirementData),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to create requirement`);
        }

        return response.json();
    },

    bulkUploadRequirements: async (file: File, jdInfo?: any) => {
        const formData = new FormData();
        formData.append('file', file);
        
        // Add JD info if provided
        if (jdInfo) {
            formData.append('jd_info', JSON.stringify(jdInfo));
        }

        const headers = getAuthHeaders();
        // Remove Content-Type header to let browser set it with boundary for FormData
        delete headers['Content-Type'];

        const response = await fetch(getApiUrl('/requirements/bulk-upload'), {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to upload requirements`);
        }

        return response.json();
    },

    uploadJobDescription: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        const headers = getAuthHeaders();
        // Remove Content-Type header to let browser set it with boundary for FormData
        delete headers['Content-Type'];

        const response = await fetch(getApiUrl('/requirements/upload-jd'), {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to upload job description`);
        }

        return response.json();
    },

    updateRequirementJD: async (file: File, requirementId: string) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('requirement_id', requirementId);

        const headers = getAuthHeaders();
        // Remove Content-Type header to let browser set it with boundary for FormData
        delete headers['Content-Type'];

        const response = await fetch(getApiUrl('/requirements/update-jd'), {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to update job description`);
        }

        return response.json();
    },

    parseJobDescription: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${process.env.NEXT_PUBLIC_JD_API_URL}/upload/process-job-description`, {
            method: 'POST',
            headers: {
                'X-API-Key': process.env.NEXT_PUBLIC_JD_API_KEY 
            },
            body: formData,
        });

        if (!response.ok) {
            let errorMessage = `Failed to parse job description (Status: ${response.status})`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (e) {
                const errorText = await response.text();
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }

        return response.json();
    },




    post: async (endpoint: string, data: any) => {
        const headers = getAuthHeaders();
        
        // Handle FormData differently from regular JSON data
        let body: string | FormData;
        if (data instanceof FormData) {
            // Remove Content-Type header to let browser set it with boundary for FormData
            delete headers['Content-Type'];
            body = data;
        } else {
            // Regular JSON data
            body = JSON.stringify(data);
        }
        
        const response = await fetch(getApiUrl(endpoint), {
            method: 'POST',
            headers,
            body,
        });

        const responseData = await response.json();
        
        // For duplicate profiles, the API returns 400 but with useful data
        if (!response.ok) {
            // Check if this is a duplicate profile error
            if (responseData.has_duplicates !== undefined) {
                // This is a duplicate profile response, return it normally
                return responseData;
            }
            // Create error with response data for better debugging
            const error = new Error(`Failed to post to ${endpoint}`);
            (error as any).response = { data: responseData, status: response.status };
            throw error;
        }

        return responseData;
    },

    put: async (endpoint: string, data: any) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl(endpoint), {
            method: 'PUT',
            headers,
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            let errorMessage = `Failed to update ${endpoint}`;
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMessage = errorData.error;
                } else if (errorData.message) {
                    errorMessage = errorData.message;
                }
            } catch (e) {
                // If response is not JSON, use default message
            }
            const error: any = new Error(errorMessage);
            error.response = { data: { error: errorMessage }, status: response.status };
            throw error;
        }

        return response.json();
    },

    delete: async (endpoint: string) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl(endpoint), {
            method: 'DELETE',
            headers,
        });

        if (!response.ok) {
            throw new Error(`Failed to delete ${endpoint}`);
        }

        return response.json();
    },

    // Profile movement methods
    moveProfile: async (profileId: string, fromRequestId: string, toRequestId: string, reason?: string) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/tracker/profiles/move'), {
            method: 'POST',
            headers,
            body: JSON.stringify({
                profile_id: profileId,
                from_request_id: fromRequestId,
                to_request_id: toRequestId,
                reason: reason || ''
            }),
        });

        const responseData = await response.json();
        
        if (!response.ok) {
            throw new Error(responseData.error || `Failed to move profile`);
        }

        return responseData;
    },

    canMoveProfile: async (profileId: string, requestId: string) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl(`/tracker/profiles/${profileId}/can-move-to/${requestId}`), {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to validate profile movement`);
        }

        return response.json();
    },

    // Costing API methods
    getSourceTemplates: async () => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/costing/source-templates'), {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            throw new Error('Failed to fetch source templates');
        }

        return response.json();
    },

    updateSourceTemplates: async (templates: any[]) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/costing/source-templates'), {
            method: 'PUT',
            headers,
            body: JSON.stringify({ templates }),
        });

        if (!response.ok) {
            throw new Error('Failed to update source templates');
        }

        return response.json();
    },

    getRecruiters: async () => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/costing/recruiters'), {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            throw new Error('Failed to fetch recruiters');
        }

        return response.json();
    },

    calculatePerUnitCost: async (data: {
        recruiter_id: string;
        start_date: string;
        end_date: string;
        source_cost: number;
        recruiter_salary: number;
        infra_cost: number;
        custom_costs: { label: string; amount: number }[];
    }) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/costing/per-unit-calculate'), {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('Failed to calculate per unit cost');
        }

        return response.json();
    },

    calculateMonthlyCost: async (data: {
        start_date: string;
        end_date: string;
        source_cost: number;
        recruiter_salary: number;
        infra_cost: number;
        custom_costs: { label: string; amount: number }[];
    }) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/costing/monthly-calculate'), {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('Failed to calculate monthly cost');
        }

        return response.json();
    },

    getProfileCount: async (data: {
        recruiter_id?: string;
        start_date: string;
        end_date: string;
    }) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/costing/profile-count'), {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch profile count');
        }

        return response.json();
    },

    // Job Posting API methods
    getRequirementsWithPostingStatus: async () => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl('/job-posting/requirements'), {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            throw new Error('Failed to fetch requirements with posting status');
        }

        return response.json();
    },

    updateJobPostingStatus: async (requestId: string, isJobPosted: boolean = true) => {
        const headers = getAuthHeaders();
        const response = await fetch(getApiUrl(`/job-posting/${requestId}/status`), {
            method: 'PUT',
            headers,
            body: JSON.stringify({ is_job_posted: isJobPosted }),
        });

        if (!response.ok) {
            throw new Error('Failed to update job posting status');
        }

        return response.json();
    }
}; 