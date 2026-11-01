import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BillingHistoryList } from '../../pages/TenantDashboard/components/BillingHistoryList';
import { AccountSettingsCard } from '../../pages/TenantDashboard/components/AccountSettingsCard';
import { LanguageProvider, useTranslation } from '../../context/LanguageContext';
import { ProfileFormState } from '../../pages/TenantDashboard/types';
import { Rental } from '../../types/index';

const LanguageObserver: React.FC = () => {
  const { language } = useTranslation();
  return <span data-testid="active-language">{language}</span>;
};

describe('Tenant BillingHistoryList & AccountSettingsCard Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 'mock-jwt-token');
  });

  it('renders empty state when tenant has no rentals instead of hardcoded dummy cards', () => {
    render(
      <BillingHistoryList
        rentals={[]}
        isLoading={false}
        isLoaded={true}
      />
    );

    expect(screen.getByText('Belum Ada Riwayat Transaksi atau Tagihan')).toBeInTheDocument();
    expect(screen.queryByText(/Cove Nuansa Home Jimbaran/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/INV-KSM-0526-782/i)).not.toBeInTheDocument();
  });

  it('renders dynamic tenant rental invoices with calculated totals and action handlers', () => {
    const onOpenContract = vi.fn().mockResolvedValue(undefined);
    const onOpenPendingPayment = vi.fn();
    const onCancelPendingRental = vi.fn();

    const mockRentals: Rental[] = [
      {
        id: 'rent-active-abc123',
        propertyId: 'prop-1',
        propertyName: 'KOSMO Canggu Hub',
        tenantId: 'user-tenant-1',
        tenantName: 'Made Tenant',
        roomId: 'room-101',
        roomNumber: '101',
        startDate: '2026-11-01',
        duration_months: 3,
        price: 3500000,
        admin_fee_amount: 5000,
        status: 'active',
        paymentStatus: 'Lunas'
      },
      {
        id: 'rent-pending-xyz789',
        propertyId: 'prop-2',
        propertyName: 'KOSMO Ubud Sanctuary',
        tenantId: 'user-tenant-1',
        tenantName: 'Made Tenant',
        roomId: 'room-202',
        roomNumber: '202',
        startDate: '2026-12-01',
        duration_months: 1,
        price: 4000000,
        admin_fee_amount: 5000,
        status: 'pending'
      }
    ];

    render(
      <BillingHistoryList
        rentals={mockRentals}
        isLoading={false}
        isLoaded={true}
        onOpenContract={onOpenContract}
        onOpenPendingPayment={onOpenPendingPayment}
        onCancelPendingRental={onCancelPendingRental}
      />
    );

    expect(screen.getByText('KOSMO Canggu Hub (Kamar 101)')).toBeInTheDocument();
    expect(screen.getByText(/INV-KSM-ABC123/)).toBeInTheDocument();
    // 3 * 3,500,000 + 5,000 = 10,505,000
    expect(screen.getByText(/10\.505\.000/)).toBeInTheDocument();

    expect(screen.getByText('KOSMO Ubud Sanctuary (Kamar 202)')).toBeInTheDocument();
    expect(screen.getByText('Menunggu Pembayaran')).toBeInTheDocument();
    // 1 * 4,000,000 + 5,000 = 4,005,000
    expect(screen.getByText(/4\.005\.000/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Bayar Sekarang'));
    expect(onOpenPendingPayment).toHaveBeenCalledWith(mockRentals[1]);

    fireEvent.click(screen.getByText('Batalkan'));
    expect(onCancelPendingRental).toHaveBeenCalledWith(mockRentals[1]);

    const contractBtns = screen.getAllByText('Unduh E-Kontrak');
    fireEvent.click(contractBtns[0]);
    expect(onOpenContract).toHaveBeenCalledWith('rent-active-abc123');
  });

  it('switches active UI language and persists profile preference in AccountSettingsCard', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'OK' }), { status: 200 })
    );

    const Wrapper: React.FC = () => {
      const [profileForm, setProfileForm] = useState<ProfileFormState>({
        name: 'Made Tenant',
        phone: '081234567890',
        paymentMethod: 'Virtual Account',
        notifications: true,
        language: 'Indonesia',
        identity_type: 'NIK',
        identity_number: '5171012304950001',
        address: 'Jl. Raya Canggu',
        occupation: 'Engineer',
        emergency_contact_name: 'Wayan',
        emergency_contact_relation: 'Saudara',
        emergency_contact_phone: '081299998888',
        date_of_birth: '1995-04-23',
        gender: 'Laki-laki'
      });

      return (
        <LanguageProvider>
          <LanguageObserver />
          <AccountSettingsCard
            userId="user-tenant-1"
            profileForm={profileForm}
            setProfileForm={setProfileForm}
          />
        </LanguageProvider>
      );
    };

    render(<Wrapper />);
    expect(screen.getByTestId('active-language')).toHaveTextContent('id');

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'English' } });

    expect(screen.getByTestId('active-language')).toHaveTextContent('en');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/users/profile/user-tenant-1'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ language: 'English' })
      })
    );
  });
});
