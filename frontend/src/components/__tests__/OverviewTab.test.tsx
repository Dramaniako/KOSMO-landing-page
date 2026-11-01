import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OverviewTab from '../../pages/LandlordDashboard/components/OverviewTab';
import { LandlordStats, User, Rental, MaintenanceTicket } from '../../types/index';

describe('OverviewTab Operational Alerts & Bank Details Suite', () => {
  const mockStats: LandlordStats = {
    balance: 15000000,
    totalRevenue: 45000000,
    totalWithdrawn: 30000000,
    totalProperti: 3,
    totalRooms: 12,
    occupiedRooms: 10,
    occupancyRate: 83.3,
    activeTenants: 10,
    withdrawals: [],
    reviewsCount: 8
  };

  const mockLandlordUser: User = {
    id: 'landlord-1',
    name: 'Wayan Landlord',
    email: 'wayan@kosmo.test',
    role: 'landlord',
    bankName: 'BCA',
    bankAccountNumber: '8870123456',
    bankAccountHolder: 'Wayan Landlord'
  };

  const mockRentals: Rental[] = [
    {
      id: 'rent-expiring-1',
      tenantId: 'user-t1',
      tenantName: 'John Doe',
      propertyId: 'prop-1',
      propertyName: 'Canggu Coliving',
      roomNumber: 'A1',
      price: 4500000,
      startDate: '2026-10-01',
      status: 'active',
      daysRemaining: 4
    }
  ];

  const mockTickets: MaintenanceTicket[] = [
    {
      id: 'ticket-1',
      rentalId: 'rent-expiring-1',
      tenantId: 'user-t1',
      propertyId: 'prop-1',
      category: 'ac',
      title: 'AC Bocor di Kamar',
      description: 'AC meneteskan air deras sejak kemarin',
      status: 'open',
      propertyName: 'Canggu Coliving'
    }
  ];

  it('renders expiring leases operational alert banner and triggers navigation', () => {
    const onNavigateTab = vi.fn();
    render(
      <OverviewTab
        stats={mockStats}
        landlordUser={mockLandlordUser}
        loading={false}
        rentals={mockRentals}
        tickets={[]}
        onOpenWithdraw={vi.fn()}
        onOpenAddProperty={vi.fn()}
        onNavigateTab={onNavigateTab}
      />
    );

    expect(screen.getByTestId('alert-expiring-leases')).toBeInTheDocument();
    expect(screen.getByText(/1 Sewa Segera Jatuh Tempo/)).toBeInTheDocument();

    const navBtn = screen.getByText(/Kelola di Tab Penyewa/);
    fireEvent.click(navBtn);
    expect(onNavigateTab).toHaveBeenCalledWith('tenants');
  });

  it('renders open maintenance tickets operational alert banner and triggers navigation', () => {
    const onNavigateTab = vi.fn();
    render(
      <OverviewTab
        stats={mockStats}
        landlordUser={mockLandlordUser}
        loading={false}
        rentals={[]}
        tickets={mockTickets}
        onOpenWithdraw={vi.fn()}
        onOpenAddProperty={vi.fn()}
        onNavigateTab={onNavigateTab}
      />
    );

    expect(screen.getByTestId('alert-open-tickets')).toBeInTheDocument();
    expect(screen.getByText(/1 Tiket Pemeliharaan Menunggu Tanggapan/)).toBeInTheDocument();

    const navBtn = screen.getByText(/Tinjau Pemeliharaan/);
    fireEvent.click(navBtn);
    expect(onNavigateTab).toHaveBeenCalledWith('maintenance');
  });

  it('renders saved bank details card with account number and verified badge', () => {
    render(
      <OverviewTab
        stats={mockStats}
        landlordUser={mockLandlordUser}
        loading={false}
        rentals={[]}
        tickets={[]}
        onOpenWithdraw={vi.fn()}
        onOpenAddProperty={vi.fn()}
      />
    );

    const bankCard = screen.getByTestId('saved-bank-details');
    expect(bankCard).toBeInTheDocument();
    expect(bankCard).toHaveTextContent('8870123456');
    expect(bankCard).toHaveTextContent('Wayan Landlord');
    expect(bankCard).toHaveTextContent('Terverifikasi');
  });
});
