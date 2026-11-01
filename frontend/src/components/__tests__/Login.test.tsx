import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../../pages/Login';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ThemeProvider>
        <LanguageProvider>
          <Login />
        </LanguageProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('Login Component Tier 3 Enhancements', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders session expired warning banner when ?expired=1 is in URL', () => {
    renderLogin('/login?expired=1');

    const banner = screen.getByTestId('session-expired-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Sesi Anda telah berakhir/i);
  });

  it('does NOT render session expired warning banner when expired parameter is absent', () => {
    renderLogin('/login');

    expect(screen.queryByTestId('session-expired-banner')).toBeNull();
  });

  it('toggles password visibility with Eye and EyeOff icons', () => {
    renderLogin('/login');

    const passwordInput = screen.getByPlaceholderText('Masukkan password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByTestId('toggle-password-visibility');
    expect(toggleBtn).toBeInTheDocument();

    // Click toggle to show password
    fireEvent.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');

    // Click toggle to hide password
    fireEvent.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('renders role selector in registration mode with default "tenant"', () => {
    renderLogin('/login');

    // Switch to register mode
    const switchBtn = screen.getByText('Daftar Sekarang');
    fireEvent.click(switchBtn);

    const roleSelector = screen.getByTestId('role-selector');
    expect(roleSelector).toBeInTheDocument();

    const tenantBtn = screen.getByTestId('role-tenant-btn');
    const landlordBtn = screen.getByTestId('role-landlord-btn');

    expect(tenantBtn.className).toContain('btn-primary');
    expect(landlordBtn.className).toContain('btn-outline');

    // Switch role to landlord
    fireEvent.click(landlordBtn);
    expect(landlordBtn.className).toContain('btn-primary');
    expect(tenantBtn.className).toContain('btn-outline');
  });

  it('submits registration with chosen landlord role in the payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        message: 'Registrasi berhasil!',
        user: { id: 'u-landlord-1', name: 'Pak Bos', email: 'bos@kos.com', role: 'landlord' },
        token: 'landlord-jwt-token'
      })
    });
    global.fetch = fetchMock;

    renderLogin('/login');

    // Switch to registration
    fireEvent.click(screen.getByText('Daftar Sekarang'));

    // Select Landlord
    fireEvent.click(screen.getByTestId('role-landlord-btn'));

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('Contoh: Bayu Nugroho'), {
      target: { value: 'Pak Bos' }
    });
    fireEvent.change(screen.getByPlaceholderText(/08123456789/), {
      target: { value: '081234567890' }
    });
    fireEvent.change(screen.getByPlaceholderText('nama@email.com'), {
      target: { value: 'bos@kos.com' }
    });
    fireEvent.change(screen.getByPlaceholderText('Masukkan password'), {
      target: { value: 'password123' }
    });

    // Submit form: find the submit button inside the form
    const submitBtn = screen.getByRole('button', { name: /Daftar Sekarang/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'bos@kos.com',
            password: 'password123',
            name: 'Pak Bos',
            phone: '081234567890',
            role: 'landlord'
          })
        })
      );
    });

    expect(localStorage.getItem('token')).toBe('landlord-jwt-token');
  });
});
