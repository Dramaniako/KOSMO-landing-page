import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TrackingTab from '../../pages/AdminDashboard/components/TrackingTab';
import LandlordHeader from '../../pages/LandlordDashboard/components/LandlordHeader';
import { LanguageProvider } from '../../context/LanguageContext';
import { ThemeProvider } from '../../context/ThemeContext';
import type { User, AdminStats, TrackingHistory } from '../../types/index';

describe('Excel Report Blob Downloads (Security & Functionality)', () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;

  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

  const mockStats: AdminStats = {
    totalVisitors: 1500,
    totalUsers: 45,
    totalLandlords: 8,
    totalProperties: 12,
    totalRooms: 40
  };

  const mockHistory: TrackingHistory = {
    history24h: [{ label: '12:00', count: 10 }],
    history7d: [{ label: 'Min (01/01)', count: 50 }],
    history30d: [{ label: '01/01', count: 120 }]
  };

  const mockLandlord: User = {
    id: 'user-landlord-99',
    email: 'landlord@kosmo.com',
    name: 'Wayan Landlord',
    role: 'landlord',
    phone: '+62 812-3456-7890'
  };

  beforeEach(() => {
    localStorage.clear();
    mockCreateObjectURL = vi.fn(() => 'blob:http://localhost:5173/mock-uuid-123');
    mockRevokeObjectURL = vi.fn();
    window.URL.createObjectURL = mockCreateObjectURL as unknown as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL as unknown as typeof window.URL.revokeObjectURL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('TrackingTab: downloads Excel report via authenticated fetch with Bearer header and no token query parameter', async () => {
    const fakeBlob = new Blob(['mock-excel-binary-data'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    let requestedUrl = '';
    let requestedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(url);
      requestedHeaders = (init?.headers || {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename=laporan_tracking_kosmo_test.xlsx'
        }),
        blob: async () => fakeBlob
      } as unknown as Response;
    });

    render(
      <TrackingTab
        stats={mockStats}
        trackingHistory={mockHistory}
        timeRange="24h"
        setTimeRange={vi.fn()}
        loading={false}
        authToken="secret-admin-jwt-token-xyz"
      />
    );

    const downloadButton = screen.getByRole('button', { name: /Unduh Laporan Excel/i });
    expect(downloadButton).toBeInTheDocument();

    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    // Verify URL does not contain token query param
    expect(requestedUrl).toContain('/reports/tracking/excel');
    expect(requestedUrl).not.toContain('token=');
    expect(requestedUrl).not.toContain('secret-admin-jwt-token-xyz');

    // Verify Authorization header contains Bearer token
    expect(requestedHeaders['Authorization']).toBe('Bearer secret-admin-jwt-token-xyz');

    // Verify Blob creation & URL revocation
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('TrackingTab: gracefully alerts on server error during download', async () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    globalThis.fetch = vi.fn(async () => {
      return {
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => 'Unauthorized'
      } as unknown as Response;
    });

    render(
      <TrackingTab
        stats={mockStats}
        trackingHistory={mockHistory}
        timeRange="24h"
        setTimeRange={vi.fn()}
        loading={false}
        authToken="invalid-token"
      />
    );

    const downloadButton = screen.getByRole('button', { name: /Unduh Laporan Excel/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('Gagal mengunduh laporan Excel. Silakan coba lagi.');
    });

    expect(mockCreateObjectURL).not.toHaveBeenCalled();
  });

  it('LandlordHeader: downloads Excel report via authenticated fetch with Bearer header and no token query parameter', async () => {
    localStorage.setItem('token', 'secret-landlord-jwt-abc');

    const fakeBlob = new Blob(['mock-landlord-excel-data'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    let requestedUrl = '';
    let requestedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(url);
      requestedHeaders = (init?.headers || {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="laporan_keuangan_Wayan_Landlord.xlsx"'
        }),
        blob: async () => fakeBlob
      } as unknown as Response;
    });

    render(
      <ThemeProvider>
        <LanguageProvider>
          <LandlordHeader
            landlordUser={mockLandlord}
            onNavigateHome={vi.fn()}
          />
        </LanguageProvider>
      </ThemeProvider>
    );

    const downloadButton = screen.getByRole('button', { name: /Unduh Laporan Excel/i });
    expect(downloadButton).toBeInTheDocument();

    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    // Verify URL does not contain token query param
    expect(requestedUrl).toContain('/reports/landlord/excel?landlordId=user-landlord-99');
    expect(requestedUrl).not.toContain('token=');
    expect(requestedUrl).not.toContain('secret-landlord-jwt-abc');

    // Verify Authorization header
    expect(requestedHeaders['Authorization']).toBe('Bearer secret-landlord-jwt-abc');

    // Verify Blob creation & URL revocation
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
