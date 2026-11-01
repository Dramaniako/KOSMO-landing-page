import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MaintenanceTab from '../../pages/AdminDashboard/components/MaintenanceTab';
import { MaintenanceTicket } from '../../types/index';

describe('Admin MaintenanceTab Component Suite', () => {
  const mockTickets: MaintenanceTicket[] = [
    {
      id: 'ticket-1',
      rentalId: 'rent-1',
      tenantId: 'user-t1',
      tenantName: 'Budi Santoso',
      propertyId: 'prop-1',
      propertyName: 'KOSMO Seminyak Hub',
      roomNumber: '201',
      category: 'ac',
      title: 'AC Tidak Dingin',
      description: 'Hembusan angin terasa hangat',
      status: 'open',
      createdAt: '2026-10-25T10:00:00Z'
    },
    {
      id: 'ticket-2',
      rentalId: 'rent-2',
      tenantId: 'user-t2',
      tenantName: 'Siti Rahma',
      propertyId: 'prop-2',
      propertyName: 'KOSMO Canggu Suite',
      roomNumber: '105',
      category: 'plumbing',
      title: 'Keran Wastafel Bocor',
      description: 'Air rembes terus di kamar mandi',
      status: 'in_progress',
      createdAt: '2026-10-26T12:00:00Z'
    },
    {
      id: 'ticket-3',
      rentalId: 'rent-3',
      tenantId: 'user-t3',
      tenantName: 'Agus Wijaya',
      propertyId: 'prop-1',
      propertyName: 'KOSMO Seminyak Hub',
      roomNumber: '102',
      category: 'wifi',
      title: 'WiFi Putus-Putus',
      description: 'Sinyal router sering hilang',
      status: 'resolved',
      createdAt: '2026-10-20T08:00:00Z'
    }
  ];

  it('renders KPI stats correctly', () => {
    render(
      <MaintenanceTab
        tickets={mockTickets}
        loading={false}
        onRefresh={vi.fn()}
        onUpdateStatus={vi.fn()}
      />
    );

    expect(screen.getByText('Total Tiket')).toBeInTheDocument();
    expect(screen.getAllByText('Menunggu Tanggapan').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sedang Dikerjakan').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Selesai').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('AC Tidak Dingin')).toBeInTheDocument();
    expect(screen.getByText('Keran Wastafel Bocor')).toBeInTheDocument();
  });

  it('filters tickets by status filter buttons', () => {
    render(
      <MaintenanceTab
        tickets={mockTickets}
        loading={false}
        onRefresh={vi.fn()}
        onUpdateStatus={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('filter-ticket-open'));
    expect(screen.getByText('AC Tidak Dingin')).toBeInTheDocument();
    expect(screen.queryByText('Keran Wastafel Bocor')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('filter-ticket-resolved'));
    expect(screen.getByText('WiFi Putus-Putus')).toBeInTheDocument();
    expect(screen.queryByText('AC Tidak Dingin')).not.toBeInTheDocument();
  });

  it('filters tickets by search query', () => {
    render(
      <MaintenanceTab
        tickets={mockTickets}
        loading={false}
        onRefresh={vi.fn()}
        onUpdateStatus={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('tickets-search-input');
    fireEvent.change(searchInput, { target: { value: 'Wastafel' } });

    expect(screen.getByText('Keran Wastafel Bocor')).toBeInTheDocument();
    expect(screen.queryByText('AC Tidak Dingin')).not.toBeInTheDocument();
  });

  it('calls onUpdateStatus when clicking status update action buttons', () => {
    const onUpdateStatus = vi.fn().mockResolvedValue(undefined);
    render(
      <MaintenanceTab
        tickets={mockTickets}
        loading={false}
        onRefresh={vi.fn()}
        onUpdateStatus={onUpdateStatus}
      />
    );

    const inProgressBtn = screen.getByTestId('ticket-in-progress-ticket-1');
    fireEvent.click(inProgressBtn);
    expect(onUpdateStatus).toHaveBeenCalledWith('ticket-1', 'in_progress');
  });
});
