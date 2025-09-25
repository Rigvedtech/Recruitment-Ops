import { Email } from '../types/student';

interface EmailTableRowProps {
    email: Email;
    onViewEmail: (email: Email) => void;
}

export default function EmailTableRow({ email, onViewEmail }: EmailTableRowProps) {
    // Function to get file icon based on extension
    const getFileIcon = (filename: string) => {
        const extension = filename.split('.').pop()?.toLowerCase();
        
        if (extension === 'pdf') {
            return (
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" />
                </svg>
            );
        } else if (extension === 'docx' || extension === 'doc') {
            return (
                <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" />
                </svg>
            );
        }
        return null;
    };

    // Function to format file size
    const formatFileSize = (bytes: number) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    // Function to check if attachments array is valid
    const hasValidAttachments = (attachments: any[] | undefined): boolean => {
        return Array.isArray(attachments) && attachments.length > 0 && attachments.some(att => 
            att && typeof att === 'object' && (att.filename || att.name) && (att.content_type || att.contentType)
        );
    };

    // Function to normalize attachment object
    const normalizeAttachment = (attachment: any) => {
        return {
            filename: attachment.filename || attachment.name || 'Unknown File',
            content_type: attachment.content_type || attachment.contentType || 'application/octet-stream',
            size: attachment.size || 0
        };
    };

    return (
        <tr className="hover:bg-gray-50">
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{email.subject}</div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500">{email.sender}</div>
            </td>
            <td className="px-6 py-4">
                <div className="flex flex-wrap gap-2">
                    {hasValidAttachments(email.attachments) ? (
                        email.attachments!.map((attachment, index) => {
                            const normalizedAttachment = normalizeAttachment(attachment);
                            return (
                                <div 
                                    key={index}
                                    className="flex items-center bg-gray-100 rounded-md px-3 py-1.5 hover:bg-gray-200 transition-colors cursor-pointer group"
                                    title={`${normalizedAttachment.filename} (${formatFileSize(normalizedAttachment.size)})`}
                                >
                                    {getFileIcon(normalizedAttachment.filename)}
                                    <span className="ml-2 text-xs text-gray-600 group-hover:text-gray-800">
                                        {normalizedAttachment.filename.length > 20 
                                            ? `${normalizedAttachment.filename.substring(0, 17)}...${normalizedAttachment.filename.split('.').pop()}`
                                            : normalizedAttachment.filename
                                        }
                                    </span>
                                </div>
                            );
                        })
                    ) : (
                        <span className="text-sm text-gray-400 italic">No attachments</span>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-right">
                <button
                    onClick={() => onViewEmail(email)}
                    type="button"
                    className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors duration-200 z-10 relative"
                    style={{ display: 'inline-flex' }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span className="whitespace-nowrap">View Email</span>
                </button>
            </td>
        </tr>
    );
} 