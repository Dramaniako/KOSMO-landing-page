import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

describe('ProtectedRoute Guard Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderWithRouter = (initialRoute = '/protected', allowedRoles?: ('admin' | 'landlord' | 'tenant')[], redirectTo?: string) => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
          <Route path="/admin" element={<div data-testid="admin-page">Admin Dashboard</div>} />
          <Route path="/landlord" element={<div data-testid="landlord-page">Landlord Dashboard</div>} />
          <Route path="/tenant" element={<div data-testid="tenant-page">Tenant Dashboard</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute allowedRoles={allowedRoles} redirectTo={redirectTo}>
                <div data-testid="protected-content">Secret Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  };

  it('redirects to /login when token is missing', () => {
    localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'tenant', name: 'Bayu' }));
    renderWithRouter();

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('redirects to /login when user is missing', () => {
    localStorage.setItem('token', 'valid-jwt-token');
    renderWithRouter();

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('redirects to /login when user JSON is malformed and cleans storage', () => {
    localStorage.setItem('token', 'valid-jwt-token');
    localStorage.setItem('user', '{broken-json');
    renderWithRouter();

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('renders children when authenticated with authorized role', () => {
    localStorage.setItem('token', 'valid-jwt-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'admin', name: 'Admin User' }));

    renderWithRouter('/protected', ['admin']);

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('renders children when allowedRoles is not specified (any authenticated user)', () => {
    localStorage.setItem('token', 'valid-jwt-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'tenant', name: 'Tenant User' }));

    renderWithRouter('/protected');

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('redirects unauthorized role to their own dashboard to prevent layout flash', () => {
    localStorage.setItem('token', 'valid-jwt-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'tenant', name: 'Tenant User' }));

    // Tenant attempting to access admin-only route
    renderWithRouter('/protected', ['admin']);

    expect(screen.getByTestId('tenant-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('redirects to custom redirectTo when specified and unauthorized', () => {
    localStorage.setItem('token', 'valid-jwt-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'tenant', name: 'Tenant User' }));

    renderWithRouter('/protected', ['admin'], '/login');

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('supports kosmo_token when token is not present', () => {
    localStorage.setItem('kosmo_token', 'valid-kosmo-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'tenant', name: 'Tenant User' }));

    renderWithRouter('/protected', ['tenant']);

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('clears all storage including kosmo_token on malformed user', () => {
    localStorage.setItem('kosmo_token', 'valid-kosmo-token');
    localStorage.setItem('token', 'valid-token');
    localStorage.setItem('user', 'not-a-valid-json-string');

    renderWithRouter();

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('kosmo_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('clears storage and redirects to /login if user JSON is a primitive or array', () => {
    localStorage.setItem('token', 'valid-token');
    localStorage.setItem('user', '12345');

    renderWithRouter();

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('clears storage and redirects to /login if user role is unrecognized/corrupted', () => {
    localStorage.setItem('token', 'valid-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'super-hacker', name: 'Bad Role' }));

    renderWithRouter('/protected', ['admin']);

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('redirects to root / if current path matches fallback target to prevent infinite redirect loops', () => {
    localStorage.setItem('token', 'valid-jwt-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'tenant', name: 'Tenant User' }));

    // Simulating accessing /tenant when allowedRoles requires 'admin'
    render(
      <MemoryRouter initialEntries={['/tenant']}>
        <Routes>
          <Route path="/" element={<div data-testid="home-page">Landing Page</div>} />
          <Route
            path="/tenant"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <div data-testid="admin-only-content">Admin Only</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-only-content')).not.toBeInTheDocument();
  });
});
