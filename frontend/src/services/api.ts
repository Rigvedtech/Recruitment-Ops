import axios, { AxiosError } from 'axios';
import { Email } from '../types/student';

interface StudentFilters {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010';

// Helper function to get auth headers
const getAuthHeaders = () => {
    if (typeof window !== 'undefined') {
        const user = localStorage.getItem('user');
        if (user) {
            try {
                const userData = JSON.parse(user);
                return {
                    'Authorization': `Bearer ${userData.username}`,
                    'Content-Type': 'application/json',
                };
            } catch (e) {
                console.error('Error parsing user data:', e);
            }
        }
    }
    return {
        'Content-Type': 'application/json',
    };
};

// Configure axios
const axiosApi = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add request interceptor to include auth headers
axiosApi.interceptors.request.use(
    (config) => {
        const authHeaders = getAuthHeaders();
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
                error.message = 'Authentication failed. Please check your Microsoft Graph configuration.';
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
    const response = await fetch(`${API_BASE_URL}/emails/all`, {
        headers
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch emails: ${response.statusText}`);
    }
    return response.json();
}

export async function getEmailRefreshStatus() {
    const headers = getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/email-refresh-status`, {
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
    const response = await fetch(`${API_BASE_URL}/emails/recruiter`, {
        headers
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch recruiter emails: ${response.statusText}`);
    }
    return response.json();
}

export async function fetchEmailsForRequest(requestId: string) {
    const headers = getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/tracker/emails/${requestId}`, {
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
    return `${API_BASE_URL}/exports/${filename}`;
};

export async function exportEmails(emails: any[]) {
    const response = await fetch(`${API_BASE_URL}/emails/export`, {
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
    const response = await fetch(`${API_BASE_URL}/students`, {
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
    
    const url = `${API_BASE_URL}/profiles${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch profiles data');
    }

    return response.json();
} 

// Tracker API methods
export async function fetchTrackerRequirements() {
    const headers = getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/tracker`, {
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
    const response = await fetch(`${API_BASE_URL}/tracker/stats`, {
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
    const response = await fetch(`${API_BASE_URL}/tracker/${requestId}`, {
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
    const response = await fetch(`${API_BASE_URL}/tracker/${requestId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
    });

    if (!response.ok) {
        throw new Error('Failed to update tracker requirement');
    }

    return response.json();
}

// Login function that doesn't require auth headers
export async function login(username: string, password: string) {
    console.log('Attempting login with:', { username, password });
    console.log('API URL:', `${API_BASE_URL}/login`);
    
    const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
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

// Recruiter login function that doesn't require auth headers
export async function recruiterLogin(username: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/recruiter/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
        throw new Error(`Failed to post to /recruiter/login`);
    }

    return response.json();
}

// Unified API object for easier use
export const api = {
    get: async (endpoint: string) => {
        const headers = getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
        const response = await fetch(`${API_BASE_URL}/recruiter-activity?days=${days}`, {
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
        const response = await fetch(`${API_BASE_URL}/requirements-activity`, {
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
        const response = await fetch(`${API_BASE_URL}/requirements`, {
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
        const response = await fetch(`${API_BASE_URL}/requirements/check-duplicate`, {
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
        const response = await fetch(`${API_BASE_URL}/requirements/force-create`, {
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

        const response = await fetch(`${API_BASE_URL}/requirements/bulk-upload`, {
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

        const response = await fetch(`${API_BASE_URL}/requirements/upload-jd`, {
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

        const response = await fetch(`${API_BASE_URL}/requirements/update-jd`, {
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
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error(`Failed to update ${endpoint}`);
        }

        return response.json();
    },

    delete: async (endpoint: string) => {
        const headers = getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
        const response = await fetch(`${API_BASE_URL}/tracker/profiles/move`, {
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
        const response = await fetch(`${API_BASE_URL}/tracker/profiles/${profileId}/can-move-to/${requestId}`, {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to validate profile movement`);
        }

        return response.json();
    }
}; 