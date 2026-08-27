import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BookingModal, { Props as BookingModalProps } from '../BookingModal';
import TenantDashboard from '../../pages/TenantDashboard';
import LandlordDashboard from '../../pages/LandlordDashboard';
import { Property, User, Rental } from '../../types/index';
import { LanguageProvider } from '../../context/LanguageContext';
import { ThemeProvider } from '../../context/ThemeContext';

describe('Empirical Verification: Challenger Gen 3 Suite (R1, R2, R3)', () => {
  const mockTenant: User = {
    id: 'usr-tenant-gen3-01',
    name: 'Gede Sukadana',
    email: 'gede.sukadana@example.com',
    role: 'tenant',
    phone: '081234567890',
    identity_type: 'NIK',
    identity_number: '5171012304950001',
    address: 'Jl. Raya Seminyak No. 10, Badung, Bali',
    occupation: 'Digital Marketer',
    emergency_contact_name: 'Made Sukadana',
    emergency_contact_phone: '081234567891',
    emergency_contact_relation: 'Orang Tua'
  };

  const mockLandlord: User = {
    id: 'usr-landlord-gen3-01',
    name: 'Wayan Landlord',
    email: 'wayan.landlord@example.com',
    role: 'landlord',
    phone: '081298765432'
  };

  const mockProperty: Property = {
    id: 'prop-canggu-gen3-01',
    name: 'KOSMO Deluxe Suite Canggu',
    district: 'Badung',
    address: 'Jl. Pantai Batu Bolong No. 12, Canggu, Bali',
    price: 4000000,
    rating: 4.9,
    image: 'https://example.com/canggu.jpg',
    description: 'All-inclusive co-living suite.',
    facilities: ['Wifi', 'AC', 'Listrik', 'Air', 'Keamanan', 'Kebersihan'],
    latitude: '-8.6500',
    longitude: '115.1300',
    totalRooms: 6,
    occupiedRooms: 2,
    ownerId: 'usr-landlord-gen3-01'
  };

  const mockActiveRental: Rental = {
    id: 'rent-gen3-test-101',
    propertyId: 'prop-canggu-gen3-01',
    propertyName: 'KOSMO Deluxe Suite Canggu',
    tenantId: 'usr-tenant-gen3-01',
    startDate: '2026-09-01',
    duration_months: 1,
    price: 4000000,
    status: 'active',
    contract_url: null,
    contract_hash: 'c878d6b8f352bf6a20d436329ef31d1d867c4273dfa06aebe41982b6b6691a0c',
    contract_signed_at: '2026-08-27T10:00:00Z',
    signer_ip: '127.0.0.1',
    signer_user_agent: 'Vitest Challenger',
    tenant_nik_passport: '5171012304950001',
    admin_fee_amount: 5000
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    // Mock HTMLCanvasElement for jsdom
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
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErmCC'
    );

    // Mock alert
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // REQUIREMENT 1 (R1): Profile Update Submission Throttling & Loading State
  // =========================================================================
  describe('R1: Profile Update Submission Throttling & Loading State', () => {
    it('prevents concurrent network requests on rapid simulated multi-clicks on "Simpan Profil"', async () => {
      localStorage.setItem('user', JSON.stringify(mockTenant));
      localStorage.setItem('token', 'mock-jwt-token-123');

      let resolvePut: (val: unknown) => void;
      const putPromise = new Promise((res) => {
        resolvePut = res;
      });

      const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation((url, init) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/users/profile')) {
          return putPromise.then(() => ({
            ok: true,
            status: 200,
            json: async () => ({
              message: 'Profil berhasil diperbarui.',
              user: { ...mockTenant, name: 'Gede Sukadana Updated' }
            })
          })) as Promise<Response>;
        }
        if (urlStr.includes('/api/rentals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [mockActiveRental]
          }) as Promise<Response>;
        }
        if (urlStr.includes('/api/reviews')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => []
          }) as Promise<Response>;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({})
        }) as Promise<Response>;
      });

      render(
        <MemoryRouter>
          <ThemeProvider>
            <LanguageProvider>
              <TenantDashboard />
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      // Enter Edit Profile mode
      const editButton = screen.getByRole('button', { name: /Edit Profil/i });
      fireEvent.click(editButton);

      // Verify submit button is present and enabled initially
      const submitButton = screen.getByRole('button', { name: /Simpan Profil/i });
      const cancelButton = screen.getByRole('button', { name: /Batal/i });
      expect(submitButton).not.toBeDisabled();
      expect(cancelButton).not.toBeDisabled();

      // Simulate 5 rapid consecutive clicks on "Simpan Profil"
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);

      // Verify that while request is in flight:
      // 1. Submit button is disabled
      expect(submitButton).toBeDisabled();
      // 2. Cancel button is disabled
      expect(cancelButton).toBeDisabled();
      // 3. Button shows spinner and "Menyimpan..." text
      expect(screen.getByText(/Menyimpan\.\.\./i)).toBeInTheDocument();

      // Verify that ONLY ONE PUT request was dispatched to /api/users/profile
      const profilePutCalls = fetchSpy.mock.calls.filter(
        ([url, init]) => String(url).includes('/api/users/profile') && init?.method === 'PUT'
      );
      expect(profilePutCalls.length).toBe(1);

      // Resolve the network request
      resolvePut!(true);

      // Wait for submission to complete and UI to return to view mode
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit Profil/i })).toBeInTheDocument();
      });

      expect(window.alert).toHaveBeenCalledWith('Profil berhasil diperbarui.');
    });

    it('resets disabled state and spinner when profile update encounters network failure', async () => {
      localStorage.setItem('user', JSON.stringify(mockTenant));
      localStorage.setItem('token', 'mock-jwt-token-123');

      vi.spyOn(window, 'fetch').mockImplementation((url, init) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/users/profile') && init?.method === 'PUT') {
          return Promise.reject(new Error('Koneksi internet terputus'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => []
        }) as Promise<Response>;
      });

      render(
        <MemoryRouter>
          <ThemeProvider>
            <LanguageProvider>
              <TenantDashboard />
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      const editButton = screen.getByRole('button', { name: /Edit Profil/i });
      fireEvent.click(editButton);

      const submitButton = screen.getByRole('button', { name: /Simpan Profil/i });
      fireEvent.click(submitButton);

      // Wait for error handling
      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Koneksi internet terputus');
      });

      // Verify submit button is re-enabled and spinner is removed
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
        expect(screen.queryByText(/Menyimpan\.\.\./i)).not.toBeInTheDocument();
        expect(screen.getByText(/Simpan Profil/i)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // REQUIREMENT 2 (R2): Visible Inline Validation on Digital Contract Signing
  // =========================================================================
  describe('R2: Visible Inline Validation on Digital Contract Signing (BookingModal)', () => {
    const defaultBookingModalProps: BookingModalProps = {
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
      currentUser: mockTenant,
      onNavigateToLogin: vi.fn(),
      renderFacilityIcon: (name: string) => <span>{name}</span>,
      hasActiveRental: false,
      activeRentalError: null
    };

    const renderModal = (props: Partial<BookingModalProps> = {}) => {
      return render(
        <LanguageProvider>
          <BookingModal {...defaultBookingModalProps} {...props} />
        </LanguageProvider>
      );
    };

    it('displays distinct inline error messages for all invalid states simultaneously upon submit', () => {
      const onSignContractMock = vi.fn();
      renderModal({ onSignContract: onSignContractMock });

      // Clear the NIK field to make it invalid
      const idInput = screen.getByPlaceholderText(/16 digit NIK KTP/i);
      fireEvent.change(idInput, { target: { value: '' } });

      const signButton = screen.getByRole('button', { name: /Setujui & Tanda Tangani Kontrak/i });
      fireEvent.click(signButton);

      // onSignContract must NOT be called
      expect(onSignContractMock).not.toHaveBeenCalled();

      // 1. NIK missing inline error
      expect(screen.getByText(/NIK wajib diisi sesuai KTP \(16 digit\)/i)).toBeInTheDocument();

      // 2. Unscrolled container error
      expect(
        screen.getByText(/Wajib membaca dan menggulir klausul kontrak hingga ke bagian paling bawah/i)
      ).toBeInTheDocument();

      // 3. Unchecked consent error
      expect(
        screen.getByText(/Wajib mencentang persetujuan syarat & ketentuan klausul kontrak sewa digital/i)
      ).toBeInTheDocument();

      // 4. Missing signature error
      expect(
        screen.getByText(/Wajib membubuhkan tanda tangan digital pada area kanvas di atas/i)
      ).toBeInTheDocument();
    });

    it('displays unconfirmed signature warning when canvas has drawing but is not confirmed', () => {
      renderModal();

      // Scroll container to bottom
      const scrollContainer = screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 300, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 180, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 450, writable: true });
      fireEvent.scroll(scrollContainer);

      // Check affirmative consent
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Fill valid NIK
      const idInput = screen.getByPlaceholderText(/16 digit NIK KTP/i);
      fireEvent.change(idInput, { target: { value: '5171012304950001' } });

      // Draw on canvas without clicking "Konfirmasi Tanda Tangan"
      const canvas = screen.getByRole('region', { name: /Klausul Kontrak/i }).parentElement?.parentElement?.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
      if (canvas) {
        fireEvent.pointerDown(canvas, { clientX: 30, clientY: 30, pointerId: 1 });
        fireEvent.pointerMove(canvas, { clientX: 70, clientY: 70, pointerId: 1 });
        fireEvent.pointerUp(canvas, { clientX: 70, clientY: 70, pointerId: 1 });
      }

      // Click submit
      const signButton = screen.getByRole('button', { name: /Setujui & Tanda Tangani Kontrak/i });
      fireEvent.click(signButton);

      // Verify unconfirmed signature specific error
      expect(
        screen.getByText(/Wajib mengeklik tombol "Konfirmasi Tanda Tangan" untuk menyimpan tanda tangan digital/i)
      ).toBeInTheDocument();
    });

    it('dynamically clears each inline error immediately when the user fixes that specific input', () => {
      renderModal();

      // Clear NIK to trigger all 4 errors simultaneously
      const idInput = screen.getByPlaceholderText(/16 digit NIK KTP/i);
      fireEvent.change(idInput, { target: { value: '' } });

      const signButton = screen.getByRole('button', { name: /Setujui & Tanda Tangani Kontrak/i });
      // Trigger all errors
      fireEvent.click(signButton);

      expect(screen.getByText(/NIK wajib diisi sesuai KTP/i)).toBeInTheDocument();
      expect(screen.getByText(/Wajib membaca dan menggulir klausul kontrak/i)).toBeInTheDocument();
      expect(screen.getByText(/Wajib mencentang persetujuan/i)).toBeInTheDocument();
      expect(screen.getByText(/Wajib membubuhkan tanda tangan digital/i)).toBeInTheDocument();

      // Dynamic fix 1: Type valid NIK -> ID error disappears immediately
      fireEvent.change(idInput, { target: { value: '5171012304950001' } });
      expect(screen.queryByText(/NIK wajib diisi/i)).not.toBeInTheDocument();
      expect(screen.getByText('Identitas Terverifikasi')).toBeInTheDocument();

      // Dynamic fix 2: Scroll container to bottom -> Scroll error disappears immediately
      const scrollContainer = screen.getByRole('region', { name: /Klausul Kontrak Sewa Digital KOSMO/i });
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 300, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 180, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 450, writable: true });
      fireEvent.scroll(scrollContainer);
      expect(screen.queryByText(/Wajib membaca dan menggulir klausul/i)).not.toBeInTheDocument();

      // Dynamic fix 3: Check affirmative consent -> Consent error disappears immediately
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeDisabled();
      fireEvent.click(checkbox);
      expect(screen.queryByText(/Wajib mencentang persetujuan/i)).not.toBeInTheDocument();

      // Dynamic fix 4: Draw and confirm signature -> Signature error disappears immediately
      const canvas = screen.getByRole('region', { name: /Klausul Kontrak/i }).parentElement?.parentElement?.querySelector('canvas');
      if (canvas) {
        fireEvent.pointerDown(canvas, { clientX: 30, clientY: 30, pointerId: 1 });
        fireEvent.pointerMove(canvas, { clientX: 70, clientY: 70, pointerId: 1 });
        fireEvent.pointerUp(canvas, { clientX: 70, clientY: 70, pointerId: 1 });
      }
      const confirmButton = screen.getByRole('button', { name: /Konfirmasi Tanda Tangan/i });
      fireEvent.click(confirmButton);
      expect(screen.queryByText(/Wajib membubuhkan tanda tangan/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Tanda tangan digital sah berhasil direkam/i)).toBeInTheDocument();
    });

    it('rejects various invalid Passport strings with descriptive inline messages', () => {
      renderModal();

      const passportToggle = screen.getByRole('button', { name: /Paspor \(WNA\)/i });
      fireEvent.click(passportToggle);

      const idInput = screen.getByPlaceholderText(/Contoh: A1234567/i);

      // Test too short
      fireEvent.change(idInput, { target: { value: 'AB' } });
      expect(screen.getByText(/Nomor Paspor harus 6 - 12 karakter \(saat ini 2 karakter\)/i)).toBeInTheDocument();

      // Test invalid characters
      fireEvent.change(idInput, { target: { value: 'A123@#45' } });
      expect(screen.getByText(/Nomor Paspor hanya boleh berisi huruf dan angka alfanumerik/i)).toBeInTheDocument();

      // Test valid Passport
      fireEvent.change(idInput, { target: { value: 'A98765432' } });
      expect(screen.getByText('Identitas Terverifikasi')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // REQUIREMENT 3 (R3): Contract PDF MIME Type & Filename Delivery
  // =========================================================================
  describe('R3: Contract PDF MIME Type & Filename Delivery', () => {
    it('creates Blob with "application/pdf" and downloads "kontrak_sewa_{id}.pdf" on Tenant Dashboard', async () => {
      localStorage.setItem('user', JSON.stringify(mockTenant));
      localStorage.setItem('token', 'mock-jwt-token-123');

      const mockPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
      const mockArrayBuffer = mockPdfBytes.buffer;

      let capturedBlob: Blob | null = null;
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalRevokeObjectURL = window.URL.revokeObjectURL;

      window.URL.createObjectURL = vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:http://localhost:5173/mock-contract-uuid';
      });
      window.URL.revokeObjectURL = vi.fn();

      const createdLinks: HTMLAnchorElement[] = [];
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'a') {
          createdLinks.push(el as HTMLAnchorElement);
        }
        return el;
      });

      vi.spyOn(window, 'fetch').mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/contract')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: async () => mockArrayBuffer
          }) as Promise<Response>;
        }
        if (urlStr.includes('/api/rentals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [mockActiveRental]
          }) as Promise<Response>;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => []
        }) as Promise<Response>;
      });

      render(
        <MemoryRouter>
          <ThemeProvider>
            <LanguageProvider>
              <TenantDashboard />
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      // Switch to Rentals tab via button text "Kos Saya (Sewa)"
      const rentalsTab = screen.getByRole('button', { name: /Kos Saya \(Sewa\)/i });
      fireEvent.click(rentalsTab);

      // Wait for rentals to load and click "Lihat Kontrak"
      await waitFor(() => {
        expect(screen.getByText('KOSMO Deluxe Suite Canggu')).toBeInTheDocument();
      });

      const viewContractBtn = screen.getByRole('button', { name: /Lihat Kontrak/i });
      fireEvent.click(viewContractBtn);

      // Verify network request and blob creation
      await waitFor(() => {
        expect(capturedBlob).not.toBeNull();
      });

      // 1. Verify Blob MIME type is strictly 'application/pdf'
      expect(capturedBlob!.type).toBe('application/pdf');

      // 2. Verify download attribute on anchor tag is 'kontrak_sewa_rent-gen3-test-101.pdf'
      expect(createdLinks.length).toBeGreaterThan(0);
      const downloadLink = createdLinks[createdLinks.length - 1];
      expect(downloadLink.download).toBe('kontrak_sewa_rent-gen3-test-101.pdf');
      expect(downloadLink.href).toBe('blob:http://localhost:5173/mock-contract-uuid');

      // Restore URL mocks
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('creates Blob with "application/pdf" and downloads "kontrak_sewa_{id}.pdf" on Landlord Dashboard', async () => {
      localStorage.setItem('user', JSON.stringify(mockLandlord));
      localStorage.setItem('token', 'mock-jwt-token-123');

      const mockPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const mockArrayBuffer = mockPdfBytes.buffer;

      let capturedBlob: Blob | null = null;
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalRevokeObjectURL = window.URL.revokeObjectURL;

      window.URL.createObjectURL = vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:http://localhost:5173/mock-landlord-contract-uuid';
      });
      window.URL.revokeObjectURL = vi.fn();

      const createdLinks: HTMLAnchorElement[] = [];
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'a') {
          createdLinks.push(el as HTMLAnchorElement);
        }
        return el;
      });

      vi.spyOn(window, 'fetch').mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/contract')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: async () => mockArrayBuffer
          }) as Promise<Response>;
        }
        if (urlStr.includes('landlord/rentals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [mockActiveRental]
          }) as Promise<Response>;
        }
        if (urlStr.includes('properties')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [mockProperty]
          }) as Promise<Response>;
        }
        if (urlStr.includes('stats')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({})
          }) as Promise<Response>;
        }
        if (urlStr.includes('reviews')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => []
          }) as Promise<Response>;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => []
        }) as Promise<Response>;
      });

      render(
        <MemoryRouter>
          <ThemeProvider>
            <LanguageProvider>
              <LandlordDashboard />
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      // Switch to Rentals tab via "Sesi Penyewa"
      const rentalsTab = screen.getByRole('button', { name: /Sesi Penyewa/i });
      fireEvent.click(rentalsTab);

      await waitFor(() => {
        expect(screen.getByText('KOSMO Deluxe Suite Canggu')).toBeInTheDocument();
      });

      const viewContractBtn = screen.getByRole('button', { name: /Lihat Kontrak/i });
      fireEvent.click(viewContractBtn);

      await waitFor(() => {
        expect(capturedBlob).not.toBeNull();
      });

      expect(capturedBlob!.type).toBe('application/pdf');
      expect(createdLinks.length).toBeGreaterThan(0);
      const downloadLink = createdLinks[createdLinks.length - 1];
      expect(downloadLink.download).toBe('kontrak_sewa_rent-gen3-test-101.pdf');
      expect(downloadLink.href).toBe('blob:http://localhost:5173/mock-landlord-contract-uuid');

      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('opens direct Cloudinary contract URL in a new tab with noopener,noreferrer', async () => {
      localStorage.setItem('user', JSON.stringify(mockTenant));
      localStorage.setItem('token', 'mock-jwt-token-123');

      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      const rentalWithDirectUrl: Rental = {
        ...mockActiveRental,
        contract_url: 'https://res.cloudinary.com/kosmo/image/upload/kosmo_contracts/contract_101.pdf'
      };

      vi.spyOn(window, 'fetch').mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/rentals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [rentalWithDirectUrl]
          }) as Promise<Response>;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => []
        }) as Promise<Response>;
      });

      render(
        <MemoryRouter>
          <ThemeProvider>
            <LanguageProvider>
              <TenantDashboard />
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      const rentalsTab = screen.getByRole('button', { name: /Kos Saya \(Sewa\)/i });
      fireEvent.click(rentalsTab);

      await waitFor(() => {
        expect(screen.getByText('KOSMO Deluxe Suite Canggu')).toBeInTheDocument();
      });

      const viewContractBtn = screen.getByRole('button', { name: /Lihat Kontrak/i });
      fireEvent.click(viewContractBtn);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://res.cloudinary.com/kosmo/image/upload/kosmo_contracts/contract_101.pdf',
        '_blank',
        'noopener,noreferrer'
      );
    });
  });
});
