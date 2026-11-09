import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FieldVerificationModal from '../components/FieldVerificationModal';
import { Property, User } from '../../../types/index';

const mockLandlords: User[] = [
  {
    id: 'landlord-1',
    name: 'I Made Surya',
    email: 'surya@kosmo.id',
    role: 'landlord',
    phone: '081234567890',
    identity_number: '5171012345678901',
    bankName: 'BCA',
    bankAccountNumber: '7720112233',
    bankAccountHolder: 'I Made Surya'
  },
  {
    id: 'landlord-2',
    name: 'Ni Luh Putu',
    email: 'putu@kosmo.id',
    role: 'landlord',
    phone: '081999888777',
    identity_number: '5171099988877766',
    bankName: 'Mandiri',
    bankAccountNumber: '14500998877',
    bankAccountHolder: 'Ni Luh Putu'
  }
];

const mockProperty: Property = {
  id: 'prop-101',
  name: 'KOSMO Sunset Residence Canggu',
  district: 'Canggu',
  address: 'Jl. Batu Bolong No. 18, Canggu',
  price: 3500000,
  rating: 4.8,
  image: 'https://example.com/kos.jpg',
  facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan'],
  description: 'Hunian nyaman dekat pantai.',
  latitude: '-8.6512',
  longitude: '115.1321',
  totalRooms: 12,
  occupiedRooms: 4,
  ownerId: 'landlord-1',
  verified_water_tank: false,
  verified_wifi_speedtest: false
};

describe('FieldVerificationModal Component', () => {
  it('renders all 4 field verification sections and pre-fills existing property data', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <FieldVerificationModal
        property={mockProperty}
        landlordUsers={mockLandlords}
        onClose={onClose}
        onSaveVerification={onSave}
      />
    );

    expect(screen.getByTestId('field-verification-modal')).toBeInTheDocument();
    expect(screen.getByText(/Bagian 1: Identitas & Legalitas Pemilik Kos/i)).toBeInTheDocument();
    expect(screen.getByText(/Bagian 2: Data Fisik Bangunan, Titik GPS & Kapasitas Kamar/i)).toBeInTheDocument();
    expect(screen.getByText(/Bagian 3: Audit Teknis Infrastruktur & Fasilitas All-Inclusive/i)).toBeInTheDocument();
    expect(screen.getByText(/Bagian 4: Persetujuan Skema Finansial & Berita Acara Verifikasi/i)).toBeInTheDocument();

    expect(screen.getByTestId('verify-property-name')).toHaveValue('KOSMO Sunset Residence Canggu');
    expect(screen.getByTestId('verify-property-price')).toHaveValue(3500000);
    expect(screen.getByTestId('verification-score-badge')).toHaveTextContent('BELUM LENGKAP (0/12 POIN)');
  });

  it('checks all 12 verification points when Check All is clicked and submits verified badges', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <FieldVerificationModal
        property={mockProperty}
        landlordUsers={mockLandlords}
        onClose={onClose}
        onSaveVerification={onSave}
      />
    );

    const checkAllBtn = screen.getByTestId('check-all-verification-btn');
    fireEvent.click(checkAllBtn);

    expect(screen.getByTestId('verification-score-badge')).toHaveTextContent('TERVERIFIKASI PENUH (LULUS 12/12)');
    expect(screen.getByTestId('verify-wifi-speedtest-checkbox')).toBeChecked();
    expect(screen.getByTestId('verify-water-tank-checkbox')).toBeChecked();

    const saveBtn = screen.getByTestId('save-verification-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: 'prop-101',
        name: 'KOSMO Sunset Residence Canggu',
        district: 'Canggu',
        price: 3500000,
        totalRooms: 12,
        occupiedRooms: 4,
        ownerId: 'landlord-1',
        verified_water_tank: true,
        verified_wifi_speedtest: true
      })
    );
  });

  it('auto-populates landlord KYC and bank details when switching the selected landlord', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <FieldVerificationModal
        property={null}
        landlordUsers={mockLandlords}
        onClose={vi.fn()}
        onSaveVerification={onSave}
      />
    );

    const landlordSelect = screen.getByTestId('verify-landlord-select');
    fireEvent.change(landlordSelect, { target: { value: 'landlord-2' } });

    expect(screen.getByDisplayValue('Ni Luh Putu')).toBeInTheDocument();
    expect(screen.getByDisplayValue('081999888777')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mandiri')).toBeInTheDocument();
  });
});
