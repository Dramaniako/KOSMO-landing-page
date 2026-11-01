/**
 * Centralized Authentication & Session Lifecycle Utility
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

/**
 * Clears user session tokens and credentials from client storage.
 * Preserves user UI preference keys (kosmo_theme, kosmo_lang, kosmo_currency).
 */
export function clearAuthStorage(): void {
  try {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('kosmo_token');
    localStorage.removeItem('auth_token');
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  } catch (err) {
    console.warn('Storage clear warning:', err);
  }
}

/**
 * Performs a complete logout sequence:
 * 1. Calls backend POST /api/auth/logout to clear HttpOnly cookies
 * 2. Purges localStorage and sessionStorage auth tokens via clearAuthStorage()
 * 3. Navigates user to /login
 * Resilient to network errors: storage is purged and redirection proceeds regardless.
 */
export async function performLogout(
  navigate?: (to: string, options?: { replace?: boolean }) => void
): Promise<void> {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      credentials: 'include'
    }).catch((err) => {
      console.warn('Backend logout call notification:', err);
    });
  } catch (err) {
    console.warn('Logout exception:', err);
  } finally {
    clearAuthStorage();
    if (navigate) {
      navigate('/login', { replace: true });
    } else if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}
