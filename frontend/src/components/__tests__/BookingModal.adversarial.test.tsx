import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookingModal, { Props } from '../BookingModal';
import { Property, User, SignedContractData } from '../../types/index';
import { LanguageProvider } from '../../context/LanguageContext';
import { formatRupiah } from '../../utils/format';

describe('Adversarial Stress Test: Evidentiary UI & Digital Contract Gating', () => {
  const mockProperty: Property = {
    id: 'prop-bali-adversarial-01',
    name: 'KOSMO Sunset Villa Canggu',
    district: 'Badung',
    address: 'Jl. Kayu Tulang No. 12, Canggu, Badung, Bali',
    price: 3500000,
    rating: 4.85,
    image: 'https://example.com/canggu-villa.jpg',
    description: 'Boutique all-inclusive co-living in Canggu.',
    facilities: ['Wifi', 'AC', 'Listrik', 'Air', 'Keamanan', 'Kebersihan'],
    latitude: '-8.6480',
    longitude: '115.1380',
    totalRooms: 10,
    occupiedRooms: 4,
    ownerId: 'owner-bali-01'
  };

  const mockUser: User = {
    id: 'usr-adversarial-01',
    name: 'Ketut Test Tenant',
    email: 'ketut.test@example.com',
    role: 'tenant',
    phone: '081999888777',
    identity_type: 'NIK',
    identity_number: '5171012304950001',
    address: 'Jl. Kayu Tulang No. 12, Canggu, Badung, Bali',
    occupation: 'Software Engineer',
    emergency_contact_name: 'Wayan Contact',
    emergency_contact_phone: '081999888666'
  };

  const mockRenderIcon = (name: string) => <span data-testid={`facility-${name}`}>{name}</span>;

  beforeEach(() => {
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

    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABTSURBVHhe7cExAQAAAMKg9U9tCj+gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPwZekAAAe3Z2f8AAAAASUVORK5CYII='
    );
  });

  const renderComponent = (props: Partial<Props> = {}) => {
    const defaultProps: Props = {
      property: mockProperty,
      showContract: true,
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

  describe('1. Clickwrap Scroll-to-Bottom Constraint', () => {
    it('initializes consent checkbox as strictly disabled', () => {
      renderComponent();
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
      expect(checkbox).not.toBeChecked();
    });

    it('keeps consent checkbox disabled when scroll is only partial', () => {
      renderComponent();
      const checkbox = screen.getByRole('checkbox');
      const scrollContainer = screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i });

      // Partial scroll: 50px of 450px total
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 50, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 180, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 450, writable: true });
      fireEvent.scroll(scrollContainer);

      expect(checkbox).toBeDisabled();
    });

    it('keeps consent checkbox disabled when scroll is 20px away from bottom (>10px threshold)', () => {
      renderComponent();
      const checkbox = screen.getByRole('checkbox');
      const scrollContainer = screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i });

      // Near bottom: 250 + 180 = 430 < 450 - 10 (440)
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 250, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 180, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 450, writable: true });
      fireEvent.scroll(scrollContainer);

      expect(checkbox).toBeDisabled();
    });

    it('enables consent checkbox once scrolled within 10px of bottom', () => {
      renderComponent();
      const checkbox = screen.getByRole('checkbox');
      const scrollContainer = screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i });

      // At bottom: 265 + 180 = 445 >= 450 - 10 (440)
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 265, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 180, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 450, writable: true });
      fireEvent.scroll(scrollContainer);

      expect(checkbox).not.toBeDisabled();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    });
  });

  describe('2. 16-Digit NIK and Passport Validation Engine', () => {
    it('rejects invalid NIK formats and accepts exact 16 numeric digits', () => {
      renderComponent();
      const idInput = screen.getByPlaceholderText(/16 digit NIK KTP/i);

      // Empty string (touch and clear)
      fireEvent.change(idInput, { target: { value: '5' } });
      fireEvent.change(idInput, { target: { value: '' } });
      expect(screen.getByText(/NIK wajib diisi sesuai KTP \(16 digit\)/i)).toBeInTheDocument();

      // Short numeric (5 digits)
      fireEvent.change(idInput, { target: { value: '12345' } });
      expect(screen.getByText(/NIK harus tepat 16 digit angka \(saat ini 5 digit\)/i)).toBeInTheDocument();

      // 15 digits (off by one short)
      fireEvent.change(idInput, { target: { value: '517101230495000' } });
      expect(screen.getByText(/NIK harus tepat 16 digit angka \(saat ini 15 digit\)/i)).toBeInTheDocument();

      // Non-digits (letters)
      fireEvent.change(idInput, { target: { value: '517101230495000A' } });
      expect(screen.getByText(/NIK hanya boleh berisi 16 digit angka/i)).toBeInTheDocument();

      // Special characters
      fireEvent.change(idInput, { target: { value: '5171-0123-0495-0' } });
      expect(screen.getByText(/NIK hanya boleh berisi 16 digit angka/i)).toBeInTheDocument();

      // Valid 16-digit numeric NIK
      fireEvent.change(idInput, { target: { value: '5171012304950001' } });
      expect(screen.getByText('Identitas Terverifikasi')).toBeInTheDocument();
      expect(screen.queryByText(/NIK harus tepat/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/NIK hanya boleh/i)).not.toBeInTheDocument();
    });

    it('rejects invalid Passport formats and accepts 6-12 alphanumeric characters', () => {
      renderComponent();

      // Switch to Passport
      const passportBtn = screen.getByRole('button', { name: /Paspor \(WNA\)/i });
      fireEvent.click(passportBtn);

      const idInput = screen.getByPlaceholderText(/Contoh: A1234567/i);

      // Empty (touch and clear)
      fireEvent.change(idInput, { target: { value: 'A' } });
      fireEvent.change(idInput, { target: { value: '' } });
      expect(screen.getByText(/Nomor Paspor wajib diisi \(6-12 karakter\)/i)).toBeInTheDocument();

      // Too short (5 chars)
      fireEvent.change(idInput, { target: { value: 'AB123' } });
      expect(screen.getByText(/Nomor Paspor harus 6 - 12 karakter \(saat ini 5 karakter\)/i)).toBeInTheDocument();

      // Non-alphanumeric (hyphen)
      fireEvent.change(idInput, { target: { value: 'A123-456' } });
      expect(screen.getByText(/Nomor Paspor hanya boleh berisi huruf dan angka/i)).toBeInTheDocument();

      // Non-alphanumeric (space)
      fireEvent.change(idInput, { target: { value: 'A123 456' } });
      expect(screen.getByText(/Nomor Paspor hanya boleh berisi huruf dan angka/i)).toBeInTheDocument();

      // Valid Passports: 6, 8, 12 characters
      const validPassports = ['A12345', 'B12345678', 'C12345678901'];
      for (const validPass of validPassports) {
        fireEvent.change(idInput, { target: { value: validPass } });
        expect(screen.getByText('Identitas Terverifikasi')).toBeInTheDocument();
      }
    });

    it('dynamically re-validates input when toggling between NIK and Passport', () => {
      renderComponent();
      const idInput = screen.getByPlaceholderText(/16 digit NIK KTP/i);

      // Enter 8-character string (valid for passport, invalid for NIK)
      fireEvent.change(idInput, { target: { value: 'A1234567' } });
      expect(screen.getByText(/NIK hanya boleh berisi 16 digit angka/i)).toBeInTheDocument();

      // Switch to Passport -> should immediately become valid
      const passportBtn = screen.getByRole('button', { name: /Paspor \(WNA\)/i });
      fireEvent.click(passportBtn);
      expect(screen.getByText('Identitas Terverifikasi')).toBeInTheDocument();

      // Switch back to NIK -> should immediately become invalid
      const nikBtn = screen.getByRole('button', { name: /KTP \(WNI\)/i });
      fireEvent.click(nikBtn);
      expect(screen.getByText(/NIK hanya boleh berisi 16 digit angka/i)).toBeInTheDocument();
    });
  });

  describe('3. Canvas Signature Pad & Base64 Export', () => {
    it('disables Confirm button and prevents confirmation before drawing', () => {
      renderComponent();
      const confirmButton = screen.getByRole('button', { name: /Konfirmasi Tanda Tangan/i });
      expect(confirmButton).toBeDisabled();
    });

    it('enables Confirm button upon drawing on canvas and exports valid Base64 PNG', () => {
      renderComponent();
      const canvas = screen.getByRole('region', { name: /Klausul Kontrak/i }).parentElement?.parentElement?.querySelector('canvas');
      expect(canvas).toBeInTheDocument();

      if (canvas) {
        fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
        fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
        fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
      }

      const confirmButton = screen.getByRole('button', { name: /Konfirmasi Tanda Tangan/i });
      expect(confirmButton).not.toBeDisabled();

      fireEvent.click(confirmButton);
      expect(screen.getByText(/Tanda tangan digital sah berhasil direkam/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tanda Tangan Terkonfirmasi/i })).toBeInTheDocument();
    });

    it('clears canvas signature and resets confirmed state on Clear button click', () => {
      renderComponent();
      const canvas = screen.getByRole('region', { name: /Klausul Kontrak/i }).parentElement?.parentElement?.querySelector('canvas');

      if (canvas) {
        fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
        fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
        fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
      }

      const confirmButton = screen.getByRole('button', { name: /Konfirmasi Tanda Tangan/i });
      fireEvent.click(confirmButton);
      expect(screen.getByText(/Tanda tangan digital sah berhasil direkam/i)).toBeInTheDocument();

      // Click Clear
      const clearButton = screen.getByRole('button', { name: /Hapus/i });
      fireEvent.click(clearButton);

      expect(screen.queryByText(/Tanda tangan digital sah berhasil direkam/i)).not.toBeInTheDocument();
      expect(confirmButton).toBeDisabled();
    });
  });

  describe('4. Fee Breakdown Arithmetic Precision', () => {
    it('accurately computes rent, Rp 5,000 flat admin fee, and total across all duration options', () => {
      renderComponent();

      const price = mockProperty.price; // 3,500,000
      const flatFee = 5000;
      const durationSelect = screen.getByLabelText(/Durasi Sewa/i);

      const testDurations = [1, 2, 3, 6, 12];

      for (const months of testDurations) {
        fireEvent.change(durationSelect, { target: { value: months.toString() } });

        const expectedRent = price * months;
        const expectedTotal = expectedRent + flatFee;

        // Check rent line item: "Sewa Kamar Bulanan (X bln)"
        expect(screen.getByText(new RegExp(`Sewa Kamar Bulanan \\(${months} bln\\)`, 'i'))).toBeInTheDocument();
        expect(screen.getByText(formatRupiah(expectedRent))).toBeInTheDocument();

        // Check flat admin fee
        expect(screen.getByText('Biaya Administrasi & Meterai Digital')).toBeInTheDocument();
        expect(screen.getByText(formatRupiah(flatFee))).toBeInTheDocument();

        // Check total due
        expect(screen.getByText(formatRupiah(expectedTotal))).toBeInTheDocument();
      }
    });

    it('handles alternative property price points with exact arithmetic', () => {
      const expensiveProp: Property = {
        ...mockProperty,
        price: 12500000 // Rp 12.5M
      };

      renderComponent({ property: expensiveProp });
      const durationSelect = screen.getByLabelText(/Durasi Sewa/i);

      // Select 6 months: 12,500,000 * 6 = 75,000,000 + 5,000 = 75,005,000
      fireEvent.change(durationSelect, { target: { value: '6' } });
      expect(screen.getByText(formatRupiah(75000000))).toBeInTheDocument();
      expect(screen.getByText(formatRupiah(5000))).toBeInTheDocument();
      expect(screen.getByText(formatRupiah(75005000))).toBeInTheDocument();
    });
  });

  describe('5. Comprehensive Sign-Gate Enactment', () => {
    it('keeps Sign button disabled until all 4 criteria are strictly met', async () => {
      const onSignContractMock = vi.fn().mockResolvedValue(true);
      renderComponent({ onSignContract: onSignContractMock });

      const signButton = screen.getByRole('button', { name: /Setujui & Tanda Tangani Kontrak/i });
      expect(signButton).toBeDisabled();

      // Step 1: Provide valid NIK -> Sign still disabled
      const idInput = screen.getByPlaceholderText(/16 digit NIK KTP/i);
      fireEvent.change(idInput, { target: { value: '5171012304950001' } });
      expect(signButton).toBeDisabled();

      // Step 2: Scroll terms to bottom -> Sign still disabled
      const scrollContainer = screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 300, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 180, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 450, writable: true });
      fireEvent.scroll(scrollContainer);
      expect(signButton).toBeDisabled();

      // Step 3: Affirm consent checkbox -> Sign still disabled
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(signButton).toBeDisabled();

      // Step 4: Draw and confirm signature -> Sign becomes ENABLED
      const canvas = screen.getByRole('region', { name: /Klausul Kontrak/i }).parentElement?.parentElement?.querySelector('canvas');
      if (canvas) {
        fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
        fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
        fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
      }
      const confirmButton = screen.getByRole('button', { name: /Konfirmasi Tanda Tangan/i });
      fireEvent.click(confirmButton);

      expect(signButton).not.toBeDisabled();

      // Click sign and verify payload
      fireEvent.click(signButton);
      await waitFor(() => {
        expect(onSignContractMock).toHaveBeenCalledTimes(1);
        expect(onSignContractMock).toHaveBeenCalledWith({
          propertyId: 'prop-bali-adversarial-01',
          durationMonths: 1,
          startDate: expect.any(String),
          tenantNikPassport: '5171012304950001',
          signatureBase64: expect.stringMatching(/^data:image\/png;base64,/),
          affirmativeConsent: true
        });
      });
    });

    it('blocks signing if tenant has an active tenancy even if all form fields are complete', () => {
      renderComponent({
        hasActiveRental: true,
        activeRentalError: 'KOSMO Covenant: Anda telah memiliki sewa aktif.'
      });

      // Complete all fields
      const idInput = screen.getByPlaceholderText(/16 digit NIK KTP/i);
      fireEvent.change(idInput, { target: { value: '5171012304950001' } });

      const scrollContainer = screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 300, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 180, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 450, writable: true });
      fireEvent.scroll(scrollContainer);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      const canvas = screen.getByRole('region', { name: /Klausul Kontrak/i }).parentElement?.parentElement?.querySelector('canvas');
      if (canvas) {
        fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
        fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
        fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
      }
      const confirmButton = screen.getByRole('button', { name: /Konfirmasi Tanda Tangan/i });
      fireEvent.click(confirmButton);

      const signButton = screen.getByRole('button', { name: /Setujui & Tanda Tangani Kontrak/i });
      expect(signButton).toBeDisabled();
    });
  });
});
