    export interface Student {
    id: number;
    name: string;
    email: string;
    phone: string;
    address: string;
    skills: string[];
    job_description: string;
    resume_path: string;
    created_at: string;
    email_keywords: string[];
    last_email_received: string;
    email_subjects: string[];
}

export interface StudentFilters {
    skill?: string;
    keyword?: string;
}

export interface Attachment {
    id?: string;
    filename?: string;
    contentType?: string;
    size?: number;
    path?: string;
}

export interface Email {
    id: string;
    subject: string;
    sender: string;
    receivedDateTime: string;
    body?: string;
    body_content_type?: string;
    clean_body?: string;
    full_body?: string;
    body_preview?: string;
    attachments?: Attachment[];
    // Additional properties for email tracking
    from?: string;
    to?: string;
    cc?: string;
    date?: string;
    status?: string;
    job_title?: string;
} 

export interface User {
    user_id: string;
    username: string;
    full_name?: string;
    email?: string;
    phone_number?: string;
    role: 'admin' | 'recruiter';
    created_at?: string;
    updated_at?: string;
}

export interface LoginFormData {
    username: string;
    password: string;
}

export interface SignupFormData {
    username: string;
    full_name: string;
    password: string;
    confirmPassword: string;
    email?: string;
    phone_number?: string;
    role: 'admin' | 'recruiter';
} 