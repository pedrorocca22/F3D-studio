/**
 * BioFFF Studio — Central configuration
 * All backend connection parameters live here.
 * Override the URL via the VITE_BACKEND_URL environment variable.
 */
export const BACKEND_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) ??
  'http://127.0.0.1:8000';
