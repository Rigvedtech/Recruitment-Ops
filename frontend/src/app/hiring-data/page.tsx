'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEmails } from '../../context/EmailContext';
import { Email } from '../../types/student';
import EmailViewer from '../../components/EmailViewer';
import EmailTableRow from '../../components/EmailTableRow';
import ExportButton from '../../components/ExportButton';

export default function HiringData() {
    const router = useRouter();
    const { emails, loading, error } = useEmails();
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [authChecked, setAuthChecked] = useState(false);

    useEffect(() => {
        // Check authentication first
        const storedUser = localStorage.getItem('user');
        if (!storedUser) {
            router.push('/login');
            return;
        }

        try {
            const userData = JSON.parse(storedUser);
            if (!userData.role || !['admin', 'recruiter'].includes(userData.role)) {
                router.push('/login');
                return;
            }
            setAuthChecked(true);
        } catch (error) {
            console.error('Error parsing user data:', error);
            localStorage.removeItem('user');
            router.push('/login');
        }
    }, [router]);

    // Don't render anything until authentication is checked
    if (!authChecked) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    // Filter emails for hiring-related subjects and exclude replies
    const hiringEmails = emails.filter(email => {
        const subject = email.subject.trim();
        const lowerSubject = subject.toLowerCase();
        // Exclude if subject starts with 're:' (case-insensitive)
        if (/^re:/i.test(subject)) return false;
        return lowerSubject.includes('rfh') || 
               lowerSubject.includes('request for hiring') ||
               lowerSubject.includes('requirement') || 
               lowerSubject.includes('urgent requirement') ||
               lowerSubject.includes('candidates required') ||
               lowerSubject.includes('very urgent :');
    });

    const handleViewEmail = (email: Email) => {
        setSelectedEmail(email);
    };

    return (
        <main className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Hiring Requirements</h1>
                    {hiringEmails.length > 0 && <ExportButton emails={hiringEmails} />}
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

                {hiringEmails.length > 0 ? (
                    <div className="bg-white shadow-sm ring-1 ring-gray-900/5 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Subject
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Sender
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Attachments
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {hiringEmails.map((email) => (
                                        <EmailTableRow
                                            key={email.id || `${email.subject}-${email.receivedDateTime}`}
                                            email={email}
                                            onViewEmail={handleViewEmail}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : !loading && (
                    <div className="text-center rounded-lg border-2 border-dashed border-gray-300 p-12">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No hiring requirements found</h3>
                        <p className="mt-1 text-sm text-gray-500">Process emails to see hiring requirements.</p>
                    </div>
                )}

                {/* Email Viewer Modal */}
                {selectedEmail && (
                    <EmailViewer
                        isOpen={!!selectedEmail}
                        onClose={() => setSelectedEmail(null)}
                        requestId={selectedEmail.subject || 'Unknown'}
                        emails={[selectedEmail]}
                        loading={false}
                    />
                )}
            </div>
        </main>
    );
} 