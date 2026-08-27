import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookingModal, { Props } from '../BookingModal';
import { Property, User, SignedContractData } from '../../types/index';
import { LanguageProvider } from '../../context/LanguageContext';

describe('BookingModal Evidentiary UI & Contract Signing Suite', () => {
  const mockProperty: Property = {
    id: 'prop-bali-01',
    name: 'KOSMO Sunset Suite Canggu',
    district: 'Badung',
    address: 'Jl. Pantai Batu Bolong No. 88, Canggu, Badung, Bali',
    price: 4500000,
    rating: 4.9,
    image: 'https://example.com/kos-canggu.jpg',
    description: 'Luxury co-living space with high-speed fiber and pool.',
    facilities: ['Wifi', 'AC', 'Listrik', 'Air', 'Kebersihan', 'Keamanan'],
    latitude: '-8.6500',
    longitude: '115.1300',
    totalRooms: 8,
    occupiedRooms: 3,
    ownerId: 'landlord-canggu-01'
  };

  const mockUser: User = {
    id: 'usr-tenant-01',
    name: 'Wayan John Doe',
    email: 'wayan.john@example.com',
    role: 'tenant',
    phone: '081234567890'
  };

  const mockSignedContract: SignedContractData = {
    rentalId: 'rent-bali-test-123',
    contractUrl: 'https://res.cloudinary.com/kosmo/image/upload/kosmo_contracts/contract_rent_123.pdf',
    contractHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    adminFee: 5000,
    totalAmount: 4505000,
    signedAt: '2026-08-27T04:30:00.000Z'
  };

  const mockRenderIcon = (name: string) => <span data-testid={`facility-${name}`}>{name}</span>;

  beforeEach(() => {
    // Setup Canvas 2D context mock for jsdom
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
      lineWidth: 2.5,
      strokeStyle: '#1d4ed8',
      lineCap: 'round',
      lineJoin: 'round'
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC');
  });

  const renderWithContext = (props: Partial<Props>) => {
    const defaultProps: Props = {
      property: mockProperty,
      showContract: false,
      setShowContract: vi.fn(),
      contractSigned: false,
      showPayment: false,
      setShowPayment: vi.fn(),
      paymentProcessing: false,
      handleProcessPayment: vi.fn(),
      showMap: false,
      setShowMap: vi.fn(),
      onClose: vi.fn(),
      currentUser: mockUser,
      onNavigateToLogin: vi.fn(),
      renderFacilityIcon: mockRenderIcon,
      hasActiveRental: false,
      activeRentalError: null,
      ...props
    };

    return render(
      <LanguageProvider>
        <BookingModal {...defaultProps} />
      </LanguageProvider>
    );
  };

  it('renders property details, all-inclusive price, and facilities', () => {
    renderWithContext({ showContract: false, showPayment: false });

    expect(screen.getByText('KOSMO Sunset Suite Canggu')).toBeInTheDocument();
    expect(screen.getByText(/Jl. Pantai Batu Bolong No. 88/)).toBeInTheDocument();
    expect(screen.getByText('Rp 4.500.000')).toBeInTheDocument();
    expect(screen.getByText('Sewa Sekarang (All-Inclusive)')).toBeInTheDocument();
    expect(screen.getByText('Tersedia: 5 dari 8 Kamar')).toBeInTheDocument();
  });

  it('renders active rental alert banner when tenant has an existing active tenancy', () => {
    renderWithContext({
      hasActiveRental: true,
      activeRentalError: 'Anda sudah memiliki hunian aktif. Kelola sewa Anda di Dashboard Tenant.'
    });

    expect(screen.getAllByText(/Anda sudah memiliki hunian aktif/i).length).toBeGreaterThan(0);
    const bookButton = screen.getByRole('button', { name: /Hunian Aktif Ditemukan/i });
    expect(bookButton).toBeDisabled();
  });

  it('renders contract signing step with statutory clauses, quotas, and fee breakdown', () => {
    renderWithContext({ showContract: true, showPayment: false });

    expect(screen.getByText(/Tanda Tangan Kontrak Digital/i)).toBeInTheDocument();
    expect(screen.getByText(/Identitas Para Pihak/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i })).toBeInTheDocument();
    expect(screen.getByText(/Token Listrik: Kuota hingga 200 kWh\/bulan/i)).toBeInTheDocument();
    expect(screen.getByText(/WiFi Internet: Fiber Optic Berkecepatan Tinggi 100 Mbps/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Klausul Sewa Tunggal/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pengadilan Negeri Denpasar \/ Badung/i).length).toBeGreaterThan(0);

    // Fee breakdown
    expect(screen.getByText('Biaya Administrasi & Meterai Digital')).toBeInTheDocument();
    expect(screen.getByText('Rp 5.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 4.505.000')).toBeInTheDocument();
  });

  it('validates 16-digit NIK format in real time', () => {
    renderWithContext({ showContract: true, showPayment: false });

    const idInput = screen.getByPlaceholderText(/16 digit NIK KTP/i);

    // Enter incomplete NIK
    fireEvent.change(idInput, { target: { value: '5171012304' } });
    expect(screen.getByText(/NIK harus tepat 16 digit angka/i)).toBeInTheDocument();

    // Enter non-numeric NIK
    fireEvent.change(idInput, { target: { value: '5171012304ABCDEF' } });
    expect(screen.getByText(/NIK hanya boleh berisi 16 digit angka/i)).toBeInTheDocument();

    // Enter valid 16-digit numeric NIK
    fireEvent.change(idInput, { target: { value: '5171012304950001' } });
    expect(screen.getByText('Identitas Terverifikasi')).toBeInTheDocument();
  });

  it('validates international passport format when passport toggle is active', () => {
    renderWithContext({ showContract: true, showPayment: false });

    const passportButton = screen.getByRole('button', { name: /Paspor \(WNA\)/i });
    fireEvent.click(passportButton);

    const idInput = screen.getByPlaceholderText(/Contoh: A1234567/i);

    // Enter short passport
    fireEvent.change(idInput, { target: { value: 'AB' } });
    expect(screen.getByText(/Nomor Paspor harus 6 - 12 karakter/i)).toBeInTheDocument();

    // Enter valid passport
    fireEvent.change(idInput, { target: { value: 'A12345678' } });
    expect(screen.getByText('Identitas Terverifikasi')).toBeInTheDocument();
  });

  it('enforces scroll-to-read clickwrap before enabling affirmative consent checkbox', () => {
    renderWithContext({ showContract: true, showPayment: false });

    const checkbox = screen.getByRole('checkbox');
    const scrollContainer = screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i });

    // Initially disabled if not scrolled to bottom
    // Simulate scroll to bottom
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 300, writable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 180, writable: true });
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 450, writable: true });

    fireEvent.scroll(scrollContainer);

    expect(checkbox).not.toBeDisabled();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('captures and confirms digital signature on canvas pad', () => {
    renderWithContext({ showContract: true, showPayment: false });

    const canvas = screen.getByRole('region', { name: /Klausul Kontrak/i }).parentElement?.parentElement?.querySelector('canvas');
    expect(canvas).toBeInTheDocument();

    // Simulate pointer down and move
    if (canvas) {
      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 100, clientY: 80, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 100, clientY: 80, pointerId: 1 });
    }

    const confirmButton = screen.getByRole('button', { name: /Konfirmasi Tanda Tangan/i });
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    expect(screen.getByText(/Tanda tangan digital sah berhasil direkam/i)).toBeInTheDocument();
  });

  it('executes onSignContract when all validation criteria are satisfied', async () => {
    const onSignContractMock = vi.fn().mockResolvedValue(true);
    renderWithContext({
      showContract: true,
      showPayment: false,
      onSignContract: onSignContractMock
    });

    // 1. Enter valid NIK
    const idInput = screen.getByPlaceholderText(/16 digit NIK KTP/i);
    fireEvent.change(idInput, { target: { value: '5171012304950001' } });

    // 2. Scroll container
    const scrollContainer = screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 300, writable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 180, writable: true });
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 450, writable: true });
    fireEvent.scroll(scrollContainer);

    // 3. Affirm consent
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // 4. Draw & confirm signature
    const canvas = screen.getByRole('region', { name: /Klausul Kontrak/i }).parentElement?.parentElement?.querySelector('canvas');
    if (canvas) {
      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 100, clientY: 80, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 100, clientY: 80, pointerId: 1 });
    }
    const confirmButton = screen.getByRole('button', { name: /Konfirmasi Tanda Tangan/i });
    fireEvent.click(confirmButton);

    // 5. Submit contract signing
    const signSubmitButton = screen.getByRole('button', { name: /Setujui & Tanda Tangani Kontrak/i });
    expect(signSubmitButton).not.toBeDisabled();
    fireEvent.click(signSubmitButton);

    await waitFor(() => {
      expect(onSignContractMock).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyId: 'prop-bali-01',
          durationMonths: 1,
          tenantNikPassport: '5171012304950001',
          affirmativeConsent: true,
          signatureBase64: expect.stringContaining('data:image/png;base64,')
        })
      );
    });
  });

  it('renders gated payment gateway with verified contract badge and SHA-256 hash', () => {
    const handleProcessPaymentMock = vi.fn();
    renderWithContext({
      showContract: false,
      showPayment: true,
      contractSigned: true,
      signedContractData: mockSignedContract,
      handleProcessPayment: handleProcessPaymentMock
    });

    expect(screen.getByText('Konfirmasi Pembayaran Sewa')).toBeInTheDocument();
    expect(screen.getByText('Kontrak Digital Sah Terverifikasi')).toBeInTheDocument();
    expect(screen.getByText(/e3b0c44298fc1c14/i)).toBeInTheDocument();
    expect(screen.getByText('Lihat Dokumen Kontrak Sewa (PDF)')).toBeInTheDocument();
    expect(screen.getByText('Biaya Administrasi & Meterai Digital')).toBeInTheDocument();
    expect(screen.getByText('Rp 4.505.000')).toBeInTheDocument();

    const payButton = screen.getByRole('button', { name: /Bayar Rp 4\.505\.000/i });
    fireEvent.click(payButton);
    expect(handleProcessPaymentMock).toHaveBeenCalledTimes(1);
  });
});
