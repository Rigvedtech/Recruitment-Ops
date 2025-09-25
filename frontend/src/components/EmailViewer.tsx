import React from 'react';

interface Email {
  id: string;
  subject: string;
  sender: string;
  receivedDateTime: string;
  body?: string;
  body_content_type?: string;
  clean_body?: string;
  full_body?: string;
  body_preview?: string;
  attachments?: any[];
}

interface EmailViewerProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  emails: Email[];
  loading: boolean;
}

const EmailViewer: React.FC<EmailViewerProps> = ({ isOpen, onClose, requestId, emails, loading }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatEmailBody = (body: string, contentType: string = 'text') => {
    if (!body) return 'No content';
    
    if (contentType === 'html') {
      // Simple HTML to text conversion for display
      return body.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }
    
    return body;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Emails for Request: {requestId}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {emails.length} email{emails.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading emails...</span>
            </div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No emails found for this request.
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {emails.map((email, index) => (
                <div key={email.id || index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  {/* Email Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {email.subject || 'No Subject'}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>
                          <strong>From:</strong> {email.sender || 'Unknown'}
                        </span>
                        <span>
                          <strong>Date:</strong> {formatDate(email.receivedDateTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Email Body */}
                  <div className="bg-gray-50 rounded p-3 text-sm text-gray-700">
                    <div className="whitespace-pre-wrap">
                      {formatEmailBody(email.clean_body || email.body || '', email.body_content_type)}
                    </div>
                  </div>

                  {/* Attachments */}
                  {email.attachments && email.attachments.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Attachments:</h4>
                      <div className="flex flex-wrap gap-2">
                        {email.attachments.map((attachment, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            📎 {attachment.filename || `Attachment ${idx + 1}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailViewer; 