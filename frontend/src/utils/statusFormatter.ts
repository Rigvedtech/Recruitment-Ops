/**
 * Utility functions for formatting status names
 * 
 * NOTE: All status/enum values come from PostgreSQL enums via the API.
 * No hardcoded enum values - PostgreSQL is the single source of truth.
 * Use the /api/get-enum-values endpoint to fetch valid values dynamically.
 */

/**
 * Format enum/status name for display (convert underscores to spaces)
 * This works with any PostgreSQL enum value format
 * @param status - The status/enum string with underscores
 * @returns Formatted string with spaces and proper capitalization
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
 * @returns Formatted status string with underscores (matching DB format)
 */
export const formatStatusForAPI = (status: string): string => {
  if (!status) return '';
  
  // Convert spaces to underscores
  return status.replace(/\s+/g, '_');
};

/**
 * Get display name for status
 * Uses dynamic formatting - no hardcoded mapping needed
 * All enum values come from PostgreSQL and are formatted consistently
 */
export const getStatusDisplayName = (status: string): string => {
  return formatStatusForDisplay(status);
};

/**
 * @deprecated Use getStatusDisplayName() instead
 * This map is kept for backward compatibility but should not be extended.
 * PostgreSQL enums are the single source of truth for valid values.
 */
export const STATUS_DISPLAY_MAP: Record<string, string> = {
  // This is dynamically generated at runtime - no need to maintain hardcoded list
};
