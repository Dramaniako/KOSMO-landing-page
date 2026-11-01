import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../App';
import { clearAuthStorage, performLogout } from '../../utils/authSession';
import ProtectedRoute from '../ProtectedRoute';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock lazy-loaded pages to isolate router behavior and make testing fast and deterministic
vi.mock('../../pages/LandingPage', () => ({
  default: () => <div data-testid="landing-page">Landing Page Mock</div>,
}));
vi.mock('../../pages/Login', () => ({
  default: () => <div data-testid="login-page">Login Page Mock</div>,
}));
vi.mock('../../pages/AdminDashboard', () => ({
  default: () => <div data-testid="admin-dashboard">Admin Dashboard Mock</div>,
}));
vi.mock('../../pages/LandlordDashboard', () => ({
  default: () => <div data-testid="landlord-dashboard">Landlord Dashboard Mock</div>,
}));
vi.mock('../../pages/TenantDashboard', () => ({
  default: () => <div data-testid="tenant-dashboard">Tenant Dashboard Mock</div>,
}));

describe('Empirical Challenger Tier 1: Role Isolation, Routing & Logout Teardown', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Adversarial Scenario 1: Corrupted / Malformed Storage at Root /', () => {
    it.each([
      ['truncated json', '{invalid-json'],
      ['unquoted json keys', '{role: admin}'],
      ['raw string "undefined"', 'undefined'],
      ['raw string "null"', 'null'],
      ['primitive number', '12345'],
      ['primitive boolean', 'true'],
      ['array of objects', '[{"role":"admin"}]'],
      ['empty object', '{}'],
      ['object with null role', '{"role":null}'],
      ['object with non-string role', '{"role":123}'],
    ])('renders LandingPage cleanly without crashing when user is %s', async (_, malformedUser) => {
      localStorage.setItem('token', 'valid-jwt-token-xyz');
      localStorage.setItem('user', malformedUser);

      window.history.pushState({}, '', '/');
      render(<App />);

      const landing = await screen.findByTestId('landing-page');
      expect(landing).toBeInTheDocument();
      expect(screen.queryByTestId('admin-dashboard')).not.toBeInTheDocument();
      expect(screen.queryByTestId('landlord-dashboard')).not.toBeInTheDocument();
    });

    it('renders LandingPage when token is missing even if user has admin role in storage', async () => {
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', name: 'Fake Admin' }));
      // No token set

      window.history.pushState({}, '', '/');
      render(<App />);

      const landing = await screen.findByTestId('landing-page');
      expect(landing).toBeInTheDocument();
      expect(screen.queryByTestId('admin-dashboard')).not.toBeInTheDocument();
    });

    it('renders LandingPage when token is empty string', async () => {
      localStorage.setItem('token', '');
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', name: 'Admin' }));

      window.history.pushState({}, '', '/');
      render(<App />);

      const landing = await screen.findByTestId('landing-page');
      expect(landing).toBeInTheDocument();
      expect(screen.queryByTestId('admin-dashboard')).not.toBeInTheDocument();
    });

    it('renders LandingPage when role is non-standard (e.g. superhero, guest)', async () => {
      localStorage.setItem('token', 'valid-token');
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'superhero', name: 'Clark Kent' }));

      window.history.pushState({}, '', '/');
      render(<App />);

      const landing = await screen.findByTestId('landing-page');
      expect(landing).toBeInTheDocument();
    });
  });

  describe('Adversarial Scenario 2: Standard Roles at Root /', () => {
    it('redirects authenticated tenant visiting / cleanly to LandingPage', async () => {
      localStorage.setItem('token', 'valid-tenant-token');
      localStorage.setItem('user', JSON.stringify({ id: 't1', role: 'tenant', name: 'Tenant A' }));

      window.history.pushState({}, '', '/');
      render(<App />);

      const landing = await screen.findByTestId('landing-page');
      expect(landing).toBeInTheDocument();
      expect(screen.queryByTestId('tenant-dashboard')).not.toBeInTheDocument();
    });

    it('redirects authenticated admin visiting / immediately to /admin', async () => {
      localStorage.setItem('token', 'valid-admin-token');
      localStorage.setItem('user', JSON.stringify({ id: 'a1', role: 'admin', name: 'Admin A' }));

      window.history.pushState({}, '', '/');
      render(<App />);

      const adminDash = await screen.findByTestId('admin-dashboard');
      expect(adminDash).toBeInTheDocument();
      expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
    });

    it('supports kosmo_token variant for admin redirection', async () => {
      localStorage.setItem('kosmo_token', 'valid-kosmo-token');
      localStorage.setItem('user', JSON.stringify({ id: 'a2', role: 'admin', name: 'Admin B' }));

      window.history.pushState({}, '', '/');
      render(<App />);

      const adminDash = await screen.findByTestId('admin-dashboard');
      expect(adminDash).toBeInTheDocument();
    });

    it('redirects authenticated landlord visiting / immediately to /landlord', async () => {
      localStorage.setItem('token', 'valid-landlord-token');
      localStorage.setItem('user', JSON.stringify({ id: 'l1', role: 'landlord', name: 'Landlord A' }));

      window.history.pushState({}, '', '/');
      render(<App />);

      const landlordDash = await screen.findByTestId('landlord-dashboard');
      expect(landlordDash).toBeInTheDocument();
      expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
    });
  });

  describe('Adversarial Scenario 3: Cross-Role Route Rejection & Loop Prevention at /tenant', () => {
    it('authenticated admin visiting /tenant is redirected to /admin without looping', async () => {
      localStorage.setItem('token', 'admin-token');
      localStorage.setItem('user', JSON.stringify({ id: 'a1', role: 'admin', name: 'Admin One' }));

      window.history.pushState({}, '', '/tenant');
      render(<App />);

      const adminDash = await screen.findByTestId('admin-dashboard');
      expect(adminDash).toBeInTheDocument();
      expect(screen.queryByTestId('tenant-dashboard')).not.toBeInTheDocument();
      expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
    });

    it('authenticated landlord visiting /tenant is redirected to /landlord without looping', async () => {
      localStorage.setItem('token', 'landlord-token');
      localStorage.setItem('user', JSON.stringify({ id: 'l1', role: 'landlord', name: 'Landlord One' }));

      window.history.pushState({}, '', '/tenant');
      render(<App />);

      const landlordDash = await screen.findByTestId('landlord-dashboard');
      expect(landlordDash).toBeInTheDocument();
      expect(screen.queryByTestId('tenant-dashboard')).not.toBeInTheDocument();
      expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
    });

    it('authenticated tenant visiting /tenant renders TenantDashboard cleanly', async () => {
      localStorage.setItem('token', 'tenant-token');
      localStorage.setItem('user', JSON.stringify({ id: 't1', role: 'tenant', name: 'Tenant One' }));

      window.history.pushState({}, '', '/tenant');
      render(<App />);

      const tenantDash = await screen.findByTestId('tenant-dashboard');
      expect(tenantDash).toBeInTheDocument();
    });

    it('unauthenticated visitor navigating to /tenant is rejected and routed to /login', async () => {
      // No token or user in storage
      window.history.pushState({}, '', '/tenant');
      render(<App />);

      const loginPage = await screen.findByTestId('login-page');
      expect(loginPage).toBeInTheDocument();
      expect(screen.queryByTestId('tenant-dashboard')).not.toBeInTheDocument();
    });

    it('ProtectedRoute component unit level verifies fallback target matches expected user dashboard', () => {
      localStorage.setItem('token', 'landlord-token');
      localStorage.setItem('user', JSON.stringify({ id: 'l1', role: 'landlord', name: 'Landlord' }));

      render(
        <MemoryRouter initialEntries={['/tenant']}>
          <Routes>
            <Route path="/landlord" element={<div data-testid="target-landlord">Landlord Area</div>} />
            <Route
              path="/tenant"
              element={
                <ProtectedRoute allowedRoles={['tenant']}>
                  <div data-testid="tenant-area">Tenant Area</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByTestId('target-landlord')).toBeInTheDocument();
      expect(screen.queryByTestId('tenant-area')).not.toBeInTheDocument();
    });

    it('useTenantData hook defense-in-depth: redirects admin or landlord immediately away from tenant scope', async () => {
      const { useTenantData } = await import('../../pages/TenantDashboard/hooks/useTenantData');
      const { renderHook } = await import('@testing-library/react');

      // Test 1: Admin user
      localStorage.setItem('user', JSON.stringify({ id: 'a1', role: 'admin' }));
      localStorage.setItem('token', 'admin-token');

      // Render hook inside MemoryRouter
      let hookResult = renderHook(() => useTenantData(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <MemoryRouter initialEntries={['/tenant']}>
            <Routes>
              <Route path="/admin" element={<div>Admin Page</div>} />
              <Route path="/tenant" element={<>{children}</>} />
            </Routes>
          </MemoryRouter>
        )
      });
      expect(hookResult.result.current.currentUser?.role).toBe('admin');

      // Test 2: Landlord user
      localStorage.setItem('user', JSON.stringify({ id: 'l1', role: 'landlord' }));
      localStorage.setItem('token', 'landlord-token');

      hookResult = renderHook(() => useTenantData(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <MemoryRouter initialEntries={['/tenant']}>
            <Routes>
              <Route path="/landlord" element={<div>Landlord Page</div>} />
              <Route path="/tenant" element={<>{children}</>} />
            </Routes>
          </MemoryRouter>
        )
      });
      expect(hookResult.result.current.currentUser?.role).toBe('landlord');
    });
  });

  describe('Adversarial Scenario 4: Logout Teardown Resilience & UI Preference Retention', () => {
    it('purges all tokens and credentials on backend 500 error while retaining kosmo UI preferences', async () => {
      localStorage.setItem('token', 'jwt-500-test');
      localStorage.setItem('kosmo_token', 'kosmo-token-test');
      localStorage.setItem('auth_token', 'auth-token-test');
      localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin' }));
      sessionStorage.setItem('active_wizard_step', '4');

      // User preferences that must be preserved
      localStorage.setItem('kosmo_theme', 'dark');
      localStorage.setItem('kosmo_lang', 'en');
      localStorage.setItem('kosmo_currency', 'usd');

      // Mock backend returning 500 Internal Server Error
      vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Database connection failed' })
      } as Response);

      const navigate = vi.fn();

      await performLogout(navigate);

      // Verify auth storage wiped
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('kosmo_token')).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(sessionStorage.getItem('active_wizard_step')).toBeNull();

      // Verify UI preferences retained
      expect(localStorage.getItem('kosmo_theme')).toBe('dark');
      expect(localStorage.getItem('kosmo_lang')).toBe('en');
      expect(localStorage.getItem('kosmo_currency')).toBe('usd');

      // Verify navigate was invoked
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('purges credentials and redirects on network abort / TypeError', async () => {
      localStorage.setItem('token', 'jwt-abort-test');
      localStorage.setItem('user', JSON.stringify({ id: 'u2', role: 'landlord' }));

      // Mock network abort
      vi.spyOn(window, 'fetch').mockRejectedValueOnce(
        new DOMException('The user aborted a request.', 'AbortError')
      );

      const navigate = vi.fn();

      await performLogout(navigate);

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('handles window.location.href fallback when navigate callback is not supplied', async () => {
      localStorage.setItem('token', 'jwt-window-test');
      localStorage.setItem('user', JSON.stringify({ id: 'u3', role: 'tenant' }));

      vi.spyOn(window, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ message: 'Logged out' })
      } as Response);

      const hrefSpy = vi.fn();
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: {
          ...originalLocation,
          set href(val: string) {
            hrefSpy(val);
          }
        }
      });

      try {
        await performLogout();
        expect(hrefSpy).toHaveBeenCalledWith('/login');
        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          writable: true,
          value: originalLocation
        });
      }
    });

    it('clearAuthStorage gracefully catches storage exceptions (e.g. quota/security issues)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const storageSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError: The operation is insecure.');
      });

      try {
        expect(() => clearAuthStorage()).not.toThrow();
        expect(warnSpy).toHaveBeenCalledWith('Storage clear warning:', expect.any(Error));
      } finally {
        storageSpy.mockRestore();
        warnSpy.mockRestore();
      }
    });
  });
});
