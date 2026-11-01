import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { clearAuthStorage, performLogout } from '../authSession';

describe('authSession utility', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('clearAuthStorage', () => {
    it('removes auth tokens and credentials while strictly preserving user UI preferences', () => {
      // Set auth credentials
      localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'User 1', role: 'tenant' }));
      localStorage.setItem('token', 'sample-jwt-token');
      localStorage.setItem('kosmo_token', 'sample-kosmo-token');
      localStorage.setItem('auth_token', 'sample-auth-token');

      // Set user preferences
      localStorage.setItem('kosmo_theme', 'dark');
      localStorage.setItem('kosmo_lang', 'id');
      localStorage.setItem('kosmo_currency', 'idr');

      // Set sessionStorage item
      sessionStorage.setItem('temp_step', '2');

      clearAuthStorage();

      // Auth credentials must be removed
      expect(localStorage.getItem('user')).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('kosmo_token')).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(sessionStorage.getItem('temp_step')).toBeNull();

      // Preferences must remain intact
      expect(localStorage.getItem('kosmo_theme')).toBe('dark');
      expect(localStorage.getItem('kosmo_lang')).toBe('id');
      expect(localStorage.getItem('kosmo_currency')).toBe('idr');
    });
  });

  describe('performLogout', () => {
    it('invokes backend POST /api/auth/logout, clears storage, and redirects to /login', async () => {
      localStorage.setItem('token', 'active-session-jwt');
      localStorage.setItem('user', JSON.stringify({ id: 'u2', role: 'admin' }));

      const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ message: 'Logout berhasil.' })
      } as Response);

      const navigate = vi.fn();

      await performLogout(navigate);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({
            Authorization: 'Bearer active-session-jwt'
          })
        })
      );

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('resiliently purges storage and redirects even when the backend network fails', async () => {
      localStorage.setItem('token', 'failing-session-jwt');
      localStorage.setItem('user', JSON.stringify({ id: 'u3', role: 'landlord' }));

      vi.spyOn(window, 'fetch').mockRejectedValueOnce(new Error('Network error: server unreachable'));

      const navigate = vi.fn();

      await performLogout(navigate);

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });
  });
});
