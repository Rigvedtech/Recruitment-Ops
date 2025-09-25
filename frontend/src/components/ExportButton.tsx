'use client';

import { useState } from 'react';
import { exportToExcel } from '../services/api';
import { Email } from '../types/student';

interface ExportButtonProps {
    emails: Email[];
}

export default function ExportButton({ emails }: ExportButtonProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExport = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await exportToExcel(emails);
            
            // Create download link
            const link = document.createElement('a');
            link.href = data.file_url;
            link.download = data.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to export data');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <button
                onClick={handleExport}
                disabled={loading}
                className={`px-4 py-2 rounded-md font-medium ${
                    loading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
            >
                {loading ? 'Exporting...' : 'Export to Excel'}
            </button>
            {error && (
                <div className="text-red-500 text-sm mt-2">{error}</div>
            )}
        </div>
    );
} 