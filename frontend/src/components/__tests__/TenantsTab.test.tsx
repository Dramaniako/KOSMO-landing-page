import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TenantsTab from '../../pages/LandlordDashboard/components/TenantsTab';
import { Rental } from '../../types/index';
import { LanguageProvider } from '../../context/LanguageContext';

describe('TenantsTab Component Suite', () => {
  const mockRentals: Rental[] = [
    {
      id: 'rent-101',
      tenantId: 'user-t1',
      tenantName: 'Budi Santoso',
      tenantPhone: '081234567890',
      propertyId: 'prop-01',
      propertyName: 'KOSMO Sunset Villa',
      roomId: 'room-1',
      roomNumber: '101',
      roomFloor: 1,
      price: 2500000,
      startDate: '01 Okt 2026',
      status: 'active',
      nextPaymentDate: '01 Nov 2026',
      daysRemaining: 2
    },
    {
      id: 'rent-102',
      tenantId: 'user-t2',
      tenantName: 'Siti Rahma',
      tenantPhone: '',
      propertyId: 'prop-01',
      propertyName: 'KOSMO Sunset Villa',
      price: 3000000,
      startDate: '15 Sep 2026',
      status: 'active',
      nextPaymentDate: '15 Okt 2026',
      daysRemaining: 14
    }
  ];

  it('renders table with tenant details, room badges, and due dates', () => {
    render(
      <LanguageProvider>
        <TenantsTab
          rentals={mockRentals}
          loading={false}
          contractDownloading={{}}
          onDownloadContract={vi.fn()}
        />
      </LanguageProvider>
    );

    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('081234567890')).toBeInTheDocument();
    expect(screen.getByTestId('room-badge-rent-101')).toHaveTextContent(/Kamar 101/);
    expect(screen.getByTestId('due-badge-rent-101')).toHaveTextContent(/2 hari/);
  });

  it('renders WhatsApp reminder link with encoded message for active tenants with phone', () => {
    render(
      <LanguageProvider>
        <TenantsTab
          rentals={mockRentals}
          loading={false}
          contractDownloading={{}}
          onDownloadContract={vi.fn()}
        />
      </LanguageProvider>
    );

    const waLink = screen.getByTestId('wa-reminder-btn-rent-101');
    expect(waLink).toBeInTheDocument();
    expect(waLink).toHaveAttribute('href', expect.stringContaining('https://wa.me/6281234567890?text='));
    expect(waLink.getAttribute('href')).toContain(encodeURIComponent('Budi Santoso'));
    expect(waLink.getAttribute('href')).toContain(encodeURIComponent('2.500.000'));
  });

  it('does NOT render WhatsApp reminder link when tenant phone is missing', () => {
    render(
      <LanguageProvider>
        <TenantsTab
          rentals={mockRentals}
          loading={false}
          contractDownloading={{}}
          onDownloadContract={vi.fn()}
        />
      </LanguageProvider>
    );

    expect(screen.queryByTestId('wa-reminder-btn-rent-102')).not.toBeInTheDocument();
  });
});
