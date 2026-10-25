/**
 * Safely extracts a string error message from API response data or error objects,
 * preventing object-as-React-child crashes when the backend sends { error: { code, message, details } }.
 */
export function extractErrorMessage(errData: any, fallback: string = 'Operation failed'): string {
  if (!errData) return fallback;
  if (typeof errData === 'string') return errData;
  
  if (errData.error) {
    if (typeof errData.error === 'string') return errData.error;
    if (typeof errData.error === 'object' && errData.error.message) {
      return String(errData.error.message);
    }
  }
  
  if (errData.message && typeof errData.message === 'string') {
    return errData.message;
  }
  
  return fallback;
}
