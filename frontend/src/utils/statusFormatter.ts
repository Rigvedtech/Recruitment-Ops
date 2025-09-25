/**
 * Utility functions for formatting status names
 */

/**
 * Format status name for display (convert underscores to spaces)
 * @param status - The status string with underscores
 * @returns Formatted status string with spaces
 */
export const formatStatusForDisplay = (status: string): string => {
  if (!status) return '';
  
  // Convert underscores to spaces and capitalize properly
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Format status name for API calls (convert spaces to underscores)
 * @param status - The status string with spaces
 * @returns Formatted status string with underscores
 */
export const formatStatusForAPI = (status: string): string => {
  if (!status) return '';
  
  // Convert spaces to underscores
  return status.replace(/\s+/g, '_');
};

/**
 * Status mapping for common values
 */
export const STATUS_DISPLAY_MAP: Record<string, string> = {
  'Interview_Scheduled': 'Interview Scheduled',
  'Candidate_Submission': 'Candidate Submission', 
  'Offer_Recommendation': 'Offer Recommendation',
  'On_Boarding': 'On Boarding',
  'On_Hold': 'On Hold',
  'Open': 'Open',
  'Closed': 'Closed',
  'Cancelled': 'Cancelled'
};

/**
 * Get display name for status using predefined mapping or fallback to formatter
 */
export const getStatusDisplayName = (status: string): string => {
  return STATUS_DISPLAY_MAP[status] || formatStatusForDisplay(status);
};
