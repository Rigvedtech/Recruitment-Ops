'use client';

import React, { createContext, useContext, useState } from 'react';
import { Email } from '../types/student';

interface EmailContextType {
    emails: Email[];
    setEmails: React.Dispatch<React.SetStateAction<Email[]>>;
    recruiterEmails: Email[];
    setRecruiterEmails: React.Dispatch<React.SetStateAction<Email[]>>;
    loading: boolean;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    error: string | null;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    lastFetchTime: Date | null;
    setLastFetchTime: React.Dispatch<React.SetStateAction<Date | null>>;
    emailsLoaded: boolean;
    setEmailsLoaded: React.Dispatch<React.SetStateAction<boolean>>;
}

const EmailContext = createContext<EmailContextType | undefined>(undefined);

export function EmailProvider({ children }: { children: React.ReactNode }) {
    const [emails, setEmails] = useState<Email[]>([]);
    const [recruiterEmails, setRecruiterEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Initialize lastFetchTime from localStorage or null
    const [lastFetchTime, setLastFetchTime] = useState<Date | null>(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('lastEmailFetchTime');
            return stored ? new Date(stored) : null;
        }
        return null;
    });
    
    const [emailsLoaded, setEmailsLoaded] = useState(false);
    
    // Persist lastFetchTime to localStorage whenever it changes
    const updateLastFetchTime = (date: Date | null) => {
        setLastFetchTime(date);
        if (typeof window !== 'undefined') {
            if (date) {
                localStorage.setItem('lastEmailFetchTime', date.toISOString());
            } else {
                localStorage.removeItem('lastEmailFetchTime');
            }
        }
    };

    return (
        <EmailContext.Provider value={{ 
            emails, 
            setEmails, 
            recruiterEmails, 
            setRecruiterEmails, 
            loading, 
            setLoading, 
            error, 
            setError,
            lastFetchTime,
            setLastFetchTime: updateLastFetchTime,
            emailsLoaded,
            setEmailsLoaded
        }}>
            {children}
        </EmailContext.Provider>
    );
}

export function useEmails() {
    const context = useContext(EmailContext);
    if (context === undefined) {
        throw new Error('useEmails must be used within an EmailProvider');
    }
    return context;
} 