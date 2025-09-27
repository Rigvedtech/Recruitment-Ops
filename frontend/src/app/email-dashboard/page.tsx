'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Email } from '../../types/student';
import ExportButton from '../../components/ExportButton';
import { ErrorBoundary } from 'react-error-boundary';
import { useEmails } from '../../context/EmailContext';
import { formatEmailBody, isHtmlContent, extractPlainText } from '../../utils/emailUtils';
import RoleGuard from '../../components/RoleGuard';
import { getEmailRefreshStatus } from '../../services/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010/api';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
    return (
        <div className="p-4 rounded-md bg-red-50" role="alert">
            <div className="flex">
                <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                </div>
                <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <p className="text-sm text-red-700 mt-2">{error.message}</p>
                    <button
                        onClick={resetErrorBoundary}
                        className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
                    >
                        Try again
                    </button>
                </div>
            </div>
        </div>
    );
}

function EmailDashboardContent() {
    const { 
        emails, 
        setEmails, 
        loading, 
        setLoading, 
        error, 
        setError, 
        lastFetchTime, 
        setLastFetchTime, 
        emailsLoaded, 
        setEmailsLoaded 
    } = useEmails();
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

    const fetchLatestEmails = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Get the current refresh status from the backend
            let refreshStatus;
            try {
                refreshStatus = await getEmailRefreshStatus();
                console.log('Current refresh status:', refreshStatus);
            } catch (err) {
                console.warn('Could not get refresh status, using local state:', err);
                refreshStatus = { has_previous_refresh: lastFetchTime !== null };
            }
            
            // Determine the time range for fetching
            let params = '';
            if (refreshStatus.has_previous_refresh && lastFetchTime) {
                // Use the last fetch time from frontend (more recent than backend)
                params = `?since=${lastFetchTime.toISOString()}`;
                console.log(`Fetching emails since ${lastFetchTime.toISOString()}`);
            } else {
                // No previous refresh, use default days
                params = '?days=20';
                console.log('No previous refresh found, fetching last 20 days');
            }
                
            const response = await axios.get(`${API_BASE_URL}/api/get-latest-mails${params}`);
            
            // Map the response to match our Email type
            const newEmails: Email[] = response.data.map((email: any) => ({
                id: email.id || '',
                subject: email.subject || 'No Subject',
                sender: email.sender || 'Unknown Sender',
                receivedDateTime: email.receivedDateTime || new Date().toISOString(),
                body: email.body || '',
                body_content_type: email.body_content_type || 'text',
                clean_body: email.clean_body || '',
                full_body: email.full_body || '',
                body_preview: email.body_preview || '',
                attachments: email.attachments || []
            }));
            
            // Merge new emails with existing ones (avoid duplicates)
            const mergedEmails = mergeEmails(emails, newEmails);
            setEmails(mergedEmails);
            
            // Update the last fetch time to now
            const now = new Date();
            setLastFetchTime(now);
            setEmailsLoaded(true);
            
            console.log(`Fetched ${newEmails.length} new emails, total: ${mergedEmails.length} at ${now.toLocaleTimeString()}`);
            
            // Show user feedback
            if (newEmails.length > 0) {
                console.log(`✅ Successfully fetched ${newEmails.length} new emails since last refresh`);
            } else {
                console.log('ℹ️ No new emails found since last refresh');
            }
            
        } catch (err) {
            console.error('Error fetching latest emails:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch emails');
        } finally {
            setLoading(false);
        }
    };

    // Helper function to merge and deduplicate emails
    const mergeEmails = (existing: Email[], newEmails: Email[]): Email[] => {
        const emailMap = new Map();
        
        // Add existing emails
        existing.forEach(email => emailMap.set(email.id, email));
        
        // Add new emails (will overwrite if duplicate)
        newEmails.forEach(email => emailMap.set(email.id, email));
        
        // Convert back to array and sort by received date
        return Array.from(emailMap.values())
            .sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime());
    };

    // Load emails when component mounts, but only if not already loaded
    useEffect(() => {
        if (!emailsLoaded && emails.length === 0) {
            fetchLatestEmails();
            setEmailsLoaded(true);
        }
    }, [emailsLoaded, emails.length]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

        if (diffInHours < 24) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffInHours < 48) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString();
        }
    };

    const handleEmailClick = (email: Email) => {
        setSelectedEmail(email);
    };

    const handleCloseEmail = () => {
        setSelectedEmail(null);
    };

    return (
        <main className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Email Processing Dashboard</h1>
                    <div className="mt-4 sm:mt-0 sm:flex sm:space-x-4">
                        <button
                            onClick={fetchLatestEmails}
                            disabled={loading}
                            className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                                loading
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                            }`}
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Refreshing...
                                </>
                            ) : (
                                <>
                                    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Refresh Emails
                                </>
                            )}
                        </button>
                        {emails.length > 0 && <ExportButton emails={emails} />}
                        <button
                            onClick={async () => {
                                try {
                                    await axios.post(`${API_BASE_URL}/api/clear-email-refresh-history`);
                                    setLastFetchTime(null);
                                    setEmails([]);
                                    setEmailsLoaded(false);
                                    console.log('Refresh history cleared');
                                } catch (err) {
                                    console.error('Error clearing refresh history:', err);
                                }
                            }}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            title="Clear refresh history (for testing)"
                        >
                            <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Clear History
                        </button>
                        {lastFetchTime && (
                            <div className="text-sm text-gray-500 self-center flex items-center space-x-2">
                                <span>
                                    Last refresh: {lastFetchTime.toLocaleTimeString()}
                                </span>
                                {emailsLoaded && emails.length > 0 && (
                                    <span className="text-green-600 flex items-center">
                                        <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        {emails.length} emails loaded
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="mb-8 rounded-md bg-red-50 p-4" role="alert">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">Error</h3>
                                <p className="text-sm text-red-700 mt-2">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Email Dashboard */}
                <div className="bg-white shadow-sm ring-1 ring-gray-900/5 rounded-lg overflow-hidden">
                    <div className="flex h-[600px]">
                        {/* Email List Panel */}
                        <div className="w-1/3 border-r border-gray-200 flex flex-col">
                            {/* Email List Header */}
                            <div className="p-4 border-b border-gray-200 bg-gray-50">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-gray-900">Inbox</h2>
                                    <span className="text-sm text-gray-500">{emails.length} emails</span>
                                </div>
                            </div>

                            {/* Email List */}
                            <div className="flex-1 overflow-y-auto">
                                {emails.length === 0 && !loading ? (
                                    <div className="p-8 text-center text-gray-500">
                                        <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                        </svg>
                                        <p>No emails found</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-200">
                                        {emails.map((email) => (
                                            <div
                                                key={email.id}
                                                onClick={() => handleEmailClick(email)}
                                                className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors duration-150 ${
                                                    selectedEmail?.id === email.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                                                }`}
                                            >
                                                <div className="flex items-start space-x-3">
                                                    <div className="flex-shrink-0">
                                                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                                            {email.sender.charAt(0).toUpperCase()}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                                {email.sender}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                {formatDate(email.receivedDateTime)}
                                                            </p>
                                                        </div>
                                                        <p className="text-sm text-gray-900 font-medium truncate mt-1">
                                                            {email.subject}
                                                        </p>
                                                        <p className="text-sm text-gray-500 truncate mt-1">
                                                            {email.body_preview || 
                                                             (email.clean_body ? extractPlainText(email.clean_body).substring(0, 100) : 'No preview available')}
                                                        </p>
                                                        {email.attachments && email.attachments.length > 0 && (
                                                            <div className="flex items-center mt-2">
                                                                <svg className="h-4 w-4 text-gray-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                                </svg>
                                                                <span className="text-xs text-gray-400">
                                                                    {email.attachments.length} attachment{email.attachments.length !== 1 ? 's' : ''}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Email Content Panel */}
                        <div className="flex-1">
                            {selectedEmail ? (
                                <div className="h-full flex flex-col">
                                    {/* Email Header */}
                                    <div className="p-6 border-b border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                                                    {selectedEmail.subject}
                                                </h2>
                                                <div className="flex items-center space-x-4 text-sm text-gray-600">
                                                    <span>From: {selectedEmail.sender}</span>
                                                    <span>Date: {selectedEmail.receivedDateTime ? new Date(selectedEmail.receivedDateTime).toLocaleString() : 'N/A'}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleCloseEmail}
                                                className="text-gray-400 hover:text-gray-600"
                                            >
                                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Email Body */}
                                    <div className="flex-1 overflow-y-auto p-6">
                                        <div className="prose max-w-none">
                                            {isHtmlContent(selectedEmail.body) || selectedEmail.body_content_type === 'html' ? (
                                                <div 
                                                    dangerouslySetInnerHTML={{ 
                                                        __html: formatEmailBody(selectedEmail.body, 'html')
                                                    }}
                                                    className="text-gray-900 email-content"
                                                    style={{
                                                        fontFamily: 'Arial, sans-serif',
                                                        fontSize: '14px',
                                                        lineHeight: '1.6'
                                                    }}
                                                />
                                            ) : (
                                                <div className="whitespace-pre-wrap text-gray-900">
                                                    {selectedEmail.body}
                                                </div>
                                            )}
                                        </div>

                                        {/* Attachments */}
                                        {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                                            <div className="mt-6 pt-6 border-t border-gray-200">
                                                <h3 className="text-sm font-medium text-gray-900 mb-3">Attachments</h3>
                                                <div className="space-y-2">
                                                    {selectedEmail.attachments.map((attachment: any, index: number) => (
                                                        <div key={index} className="flex items-center p-3 bg-gray-50 rounded-lg">
                                                            <svg className="h-5 w-5 text-gray-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                            </svg>
                                                            <span className="text-sm text-gray-900">{attachment.name}</span>
                                                            <span className="text-xs text-gray-500 ml-auto">
                                                                {attachment.size ? `${(attachment.size / 1024).toFixed(1)} KB` : ''}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-500">
                                    <div className="text-center">
                                        <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                        </svg>
                                        <p>Select an email to view its content</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

export default function EmailDashboard() {
    return (
        <RoleGuard allowedRoles={['admin']}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <EmailDashboardContent />
            </ErrorBoundary>
        </RoleGuard>
    );
} 