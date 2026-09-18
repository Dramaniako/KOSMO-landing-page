import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MaintenanceTicketModal } from '../../pages/TenantDashboard/components/MaintenanceTicketModal';
import { MaintenanceSection } from '../../pages/TenantDashboard/components/MaintenanceSection';
import MaintenanceTab from '../../pages/LandlordDashboard/components/MaintenanceTab';
import * as apiClient from '../../services/apiClient';
import { Rental, MaintenanceTicket } from '../../types/index';

vi.mock('../../services/apiClient', () => ({
  request: vi.fn(),
  getAuthToken: vi.fn(() => 'mock-token'),
  API_BASE: '/api'
}));

describe('Maintenance Ticket Frontend Components', () => {
  const mockRentals: Rental[] = [
    {
      id: 'rent-01',
      tenantId: 'user-tenant',
      propertyId: 'prop-01',
      propertyName: 'KOSMO Hub Denpasar',
      roomId: 'room-101',
      roomNumber: '101',
      price: 3500000,
      startDate: '2026-09-01',
      status: 'active'
    }
  ];

  const mockTickets: MaintenanceTicket[] = [
    {
      id: 'ticket-101',
      rentalId: 'rent-01',
      tenantId: 'user-tenant',
      propertyId: 'prop-01',
      propertyName: 'KOSMO Hub Denpasar',
      roomNumber: '101',
      category: 'ac',
      title: 'AC berisik dan bergetar',
      description: 'AC kamar bergetar keras ketika kompresor menyala.',
      photoUrl: 'https://example.com/ac.jpg',
      status: 'open',
      createdAt: '2026-09-15T10:00:00Z'
    },
    {
      id: 'ticket-102',
      rentalId: 'rent-01',
      tenantId: 'user-tenant',
      propertyId: 'prop-01',
      propertyName: 'KOSMO Hub Denpasar',
      roomNumber: '101',
      category: 'wifi',
      title: 'Koneksi WiFi terputus',
      description: 'Sinyal router tidak terdeteksi di kamar.',
      status: 'resolved',
      createdAt: '2026-09-10T08:00:00Z',
      resolvedAt: '2026-09-11T12:00:00Z'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MaintenanceTicketModal', () => {
    it('renders category options and submits form data', async () => {
      const handleClose = vi.fn();
      const handleSubmit = vi.fn();
      const requestMock = vi.mocked(apiClient.request);
      requestMock.mockResolvedValueOnce({ id: 'ticket-new', status: 'open' });

      render(
        <MaintenanceTicketModal
          isOpen={true}
          onClose={handleClose}
          activeRentals={mockRentals}
          onTicketSubmitted={handleSubmit}
        />
      );

      expect(screen.getByText('Ajukan Tiket Pemeliharaan')).toBeInTheDocument();
      expect(screen.getByText('AC / Pendingin Ruangan')).toBeInTheDocument();

      const titleInput = screen.getByPlaceholderText(/ac kamar bocor/i);
      const descInput = screen.getByPlaceholderText(/jelaskan detail masalah/i);
      const submitBtn = screen.getByRole('button', { name: /kirim tiket/i });

      fireEvent.change(titleInput, { target: { value: 'Kran kamar mandi patah' } });
      fireEvent.change(descInput, { target: { value: 'Kran air tidak bisa dimatikan dan mengalir deras.' } });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(requestMock).toHaveBeenCalledWith('/api/tickets', expect.objectContaining({
          method: 'POST'
        }));
        expect(handleSubmit).toHaveBeenCalled();
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it('displays error message if submission fails', async () => {
      const handleClose = vi.fn();
      const handleSubmit = vi.fn();
      const requestMock = vi.mocked(apiClient.request);
      requestMock.mockRejectedValueOnce(new Error('Kamar tidak terdaftar'));

      render(
        <MaintenanceTicketModal
          isOpen={true}
          onClose={handleClose}
          activeRentals={mockRentals}
          onTicketSubmitted={handleSubmit}
        />
      );

      const titleInput = screen.getByPlaceholderText(/ac kamar bocor/i);
      const descInput = screen.getByPlaceholderText(/jelaskan detail masalah/i);
      const submitBtn = screen.getByRole('button', { name: /kirim tiket/i });

      fireEvent.change(titleInput, { target: { value: 'Lampu kamar mati' } });
      fireEvent.change(descInput, { target: { value: 'Lampu utama kamar tiba-tiba padam.' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Kamar tidak terdaftar')).toBeInTheDocument();
      });
    });
  });

  describe('MaintenanceSection (Tenant)', () => {
    it('renders list of tickets with category and status badges', async () => {
      const requestMock = vi.mocked(apiClient.request);
      requestMock.mockResolvedValueOnce(mockTickets);

      render(<MaintenanceSection activeRentals={mockRentals} />);

      await waitFor(() => {
        expect(screen.getByText('AC berisik dan bergetar')).toBeInTheDocument();
        expect(screen.getByText('Koneksi WiFi terputus')).toBeInTheDocument();
      });

      // Status badges
      expect(screen.getAllByText('Menunggu Tanggapan').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Selesai').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('MaintenanceTab (Landlord)', () => {
    it('renders tickets and allows updating status to in_progress or resolved', async () => {
      const requestMock = vi.mocked(apiClient.request);
      requestMock.mockResolvedValueOnce(mockTickets);
      requestMock.mockResolvedValueOnce({
        ...mockTickets[0],
        status: 'in_progress'
      });

      render(<MaintenanceTab />);

      await waitFor(() => {
        expect(screen.getByText('AC berisik dan bergetar')).toBeInTheDocument();
      });

      // Click "Sedang Dikerjakan" action button
      const progressBtn = screen.getByTestId('btn-in-progress-ticket-101');
      fireEvent.click(progressBtn);

      await waitFor(() => {
        expect(requestMock).toHaveBeenCalledWith(
          '/api/tickets/ticket-101/status',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'in_progress' })
          })
        );
      });
    });
  });
});
