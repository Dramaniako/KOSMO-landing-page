import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveRentalSection } from '../../pages/TenantDashboard/components/ActiveRentalSection';
import { Rental } from '../../types/index';
import { LanguageProvider } from '../../context/LanguageContext';

describe('ActiveRentalSection Component Suite', () => {
  const mockActiveRentalWithRoom: Rental = {
    id: 'rent-001',
    tenantId: 'tenant-001',
    propertyId: 'prop-canggu-01',
    roomId: 'room-102',
    roomNumber: '102',
    roomFloor: 1,
    roomType: 'Deluxe Suite',
    propertyName: 'KOSMO Sunset Canggu',
    price: 3500000,
    startDate: '01 Sep 2026',
    status: 'active',
    contract_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    contract_signed_at: '2026-09-01T08:00:00Z',
    paymentStatus: 'Lunas',
    nextPaymentDate: '01 Okt 2026',
    daysRemaining: 26
  };

  const renderComponent = (props: Partial<React.ComponentProps<typeof ActiveRentalSection>> = {}) => {
    const defaultProps = {
      activeRental: mockActiveRentalWithRoom,
      isLoading: false,
      isLoaded: true,
      contractDownloading: {},
      onOpenContract: vi.fn(),
      onOpenTerminate: vi.fn(),
      onExplore: vi.fn(),
      ...props
    };

    return render(
      <LanguageProvider>
        <ActiveRentalSection {...defaultProps} />
      </LanguageProvider>
    );
  };

  it('renders assigned discrete room badge with room number, floor, and room type', () => {
    renderComponent();
    expect(screen.getByTestId('active-rental-room-badge')).toBeInTheDocument();
    expect(screen.getByText(/Kamar 102/)).toBeInTheDocument();
    expect(screen.getByText(/Lantai 1/)).toBeInTheDocument();
    expect(screen.getByText(/Deluxe Suite/)).toBeInTheDocument();
  });

  it('renders legacy rental gracefully when roomNumber is omitted', () => {
    const legacyRental = { ...mockActiveRentalWithRoom, roomNumber: null, roomFloor: null, roomType: null, roomId: null };
    renderComponent({ activeRental: legacyRental });
    expect(screen.queryByTestId('active-rental-room-badge')).not.toBeInTheDocument();
    expect(screen.getByText('KOSMO Sunset Canggu')).toBeInTheDocument();
  });

  it('triggers onOpenContract when clicking Lihat Dokumen Kontrak', () => {
    const onOpenContract = vi.fn();
    renderComponent({ onOpenContract });
    const btn = screen.getByRole('button', { name: /Lihat.*Kontrak/i });
    fireEvent.click(btn);
    expect(onOpenContract).toHaveBeenCalledWith('rent-001');
  });

  it('triggers onOpenTerminate when clicking Berhenti Menyewa', () => {
    const onOpenTerminate = vi.fn();
    renderComponent({ onOpenTerminate });
    const btn = screen.getByRole('button', { name: /Berhenti Menyewa/i });
    fireEvent.click(btn);
    expect(onOpenTerminate).toHaveBeenCalledWith(mockActiveRentalWithRoom);
  });

  it('triggers onViewContractDetails when clicking Detail Perjanjian', () => {
    const onViewContractDetails = vi.fn();
    renderComponent({ onViewContractDetails });
    const btn = screen.getByTestId('view-contract-details-btn');
    fireEvent.click(btn);
    expect(onViewContractDetails).toHaveBeenCalledWith(mockActiveRentalWithRoom);
  });

  it('renders empty state when no active rental exists', () => {
    renderComponent({ activeRental: undefined });
    expect(screen.getByText(/Anda belum memiliki sewa kos aktif/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jelajahi Kos/i })).toBeInTheDocument();
  });
});
