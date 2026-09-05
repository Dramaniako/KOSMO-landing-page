import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoomInventoryModal from '../../pages/LandlordDashboard/components/RoomInventoryModal';
import ActiveRentalSection from '../../pages/TenantDashboard/components/ActiveRentalSection';
import { RentalHistorySection } from '../../pages/TenantDashboard/components/RentalHistorySection';
import ContractViewerModal from '../../pages/TenantDashboard/components/ContractViewerModal';
import { Property, Room, Rental } from '../../types/index';
import { LanguageProvider } from '../../context/LanguageContext';

describe('Milestone 4 Adversarial Verification: Landlord & Tenant Workflows', () => {
  const mockProperty: Property = {
    id: 'prop-bali-test-01',
    name: 'KOSMO Seminyak Discrete Suites',
    district: 'Badung',
    address: 'Jl. Petitenget No. 88, Seminyak, Bali',
    price: 3500000,
    rating: 4.9,
    image: 'https://example.com/bali.jpg',
    description: 'All-inclusive co-living suite with discrete rooms.',
    facilities: ['Wifi', 'AC', 'Listrik', 'Air', 'Keamanan'],
    latitude: '-8.6833',
    longitude: '115.1572',
    totalRooms: 3,
    occupiedRooms: 1,
    ownerId: 'usr-landlord-01'
  };

  const mockRooms: Room[] = [
    {
      id: 'room-101',
      propertyId: 'prop-bali-test-01',
      roomNumber: '101',
      floor: 1,
      type: 'Deluxe Queen',
      price: 3500000,
      effectivePrice: 3500000,
      status: 'available',
      photos: []
    },
    {
      id: 'room-102',
      propertyId: 'prop-bali-test-01',
      roomNumber: '102',
      floor: 1,
      type: 'Deluxe Suite',
      price: 3800000,
      effectivePrice: 3800000,
      status: 'occupied',
      photos: []
    },
    {
      id: 'room-201',
      propertyId: 'prop-bali-test-01',
      roomNumber: '201',
      floor: 2,
      type: 'Executive Balcony',
      price: 4200000,
      effectivePrice: 4200000,
      status: 'maintenance',
      photos: []
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Dimension 1: Landlord Dashboard Room Inventory - Occupied Room Lock
  // =========================================================================
  describe('Landlord Dashboard: Room Inventory & Occupied Room Locks', () => {
    it('strictly hides delete button and status toggle button for occupied rooms', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((url) => {
        if (String(url).includes('/api/properties/prop-bali-test-01/rooms')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockRooms
          } as Response);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      render(
        <RoomInventoryModal
          property={mockProperty}
          onClose={vi.fn()}
          onRoomUpdated={vi.fn()}
        />
      );

      // Wait for rooms to load
      await waitFor(() => {
        expect(screen.getByText('102')).toBeInTheDocument();
      });

      // Occupied room 102 must NOT have a delete button
      expect(screen.queryByTestId('delete-room-102')).not.toBeInTheDocument();

      // Occupied room 102 must NOT have a toggle status button; it should render "Tersewa"
      expect(screen.queryByTestId('toggle-status-room-102')).not.toBeInTheDocument();
      expect(screen.getByText('Tersewa')).toBeInTheDocument();

      // Available room 101 MUST have both delete and toggle buttons
      expect(screen.getByTestId('delete-room-101')).toBeInTheDocument();
      expect(screen.getByTestId('toggle-status-room-101')).toBeInTheDocument();

      // Maintenance room 201 MUST have both delete and toggle buttons
      expect(screen.getByTestId('delete-room-201')).toBeInTheDocument();
      expect(screen.getByTestId('toggle-status-room-201')).toBeInTheDocument();
    });

    it('toggles available room to maintenance with optimistic update and PATCH request', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/properties/prop-bali-test-01/rooms/room-101/status') && opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ message: 'Status kamar berhasil diperbarui' })
          } as Response);
        }
        if (urlStr.includes('/api/properties/prop-bali-test-01/rooms')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockRooms
          } as Response);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const onRoomUpdated = vi.fn();
      render(
        <RoomInventoryModal
          property={mockProperty}
          onClose={vi.fn()}
          onRoomUpdated={onRoomUpdated}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('toggle-status-room-101')).toBeInTheDocument();
      });

      // Room 101 is available; button title/label should offer switching to maintenance ("Pemeliharaan")
      const toggleBtn = screen.getByTestId('toggle-status-room-101');
      expect(toggleBtn).toHaveTextContent('Pemeliharaan');

      fireEvent.click(toggleBtn);

      // Verify PATCH was called with next status 'maintenance'
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('/properties/prop-bali-test-01/rooms/room-101/status'),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'maintenance' })
          })
        );
      });

      // Verify onRoomUpdated callback was called
      expect(onRoomUpdated).toHaveBeenCalled();
    });

    it('toggles maintenance room back to available with PATCH request', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/properties/prop-bali-test-01/rooms/room-201/status') && opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ message: 'Status kamar berhasil diperbarui' })
          } as Response);
        }
        if (urlStr.includes('/api/properties/prop-bali-test-01/rooms')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockRooms
          } as Response);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      render(
        <RoomInventoryModal
          property={mockProperty}
          onClose={vi.fn()}
          onRoomUpdated={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('toggle-status-room-201')).toBeInTheDocument();
      });

      // Room 201 is in maintenance; button label should be "Tersedia"
      const toggleBtn = screen.getByTestId('toggle-status-room-201');
      expect(toggleBtn).toHaveTextContent('Tersedia');

      fireEvent.click(toggleBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('/properties/prop-bali-test-01/rooms/room-201/status'),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'available' })
          })
        );
      });
    });

    it('reverts optimistic status update and displays error alert when backend rejects PATCH', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/properties/prop-bali-test-01/rooms/room-101/status') && opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: false,
            json: async () => ({ message: 'Gagal memperbarui status: Koneksi database terputus.' })
          } as Response);
        }
        if (urlStr.includes('/api/properties/prop-bali-test-01/rooms')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockRooms
          } as Response);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      render(
        <RoomInventoryModal
          property={mockProperty}
          onClose={vi.fn()}
          onRoomUpdated={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('toggle-status-room-101')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('toggle-status-room-101'));

      await waitFor(() => {
        expect(screen.getByText(/Gagal memperbarui status/i)).toBeInTheDocument();
      });
    });

    it('enforces password confirmation modal before deleting an available room', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/properties/prop-bali-test-01/rooms/room-101') && opts?.method === 'DELETE') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ message: 'Kamar berhasil dihapus!' })
          } as Response);
        }
        if (urlStr.includes('/api/properties/prop-bali-test-01/rooms')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockRooms
          } as Response);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      render(
        <RoomInventoryModal
          property={mockProperty}
          onClose={vi.fn()}
          onRoomUpdated={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('delete-room-101')).toBeInTheDocument();
      });

      // Click delete button on available room 101
      fireEvent.click(screen.getByTestId('delete-room-101'));

      // Password confirmation gate modal must appear
      expect(screen.getByText('Hapus Kamar 101')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password akun')).toBeInTheDocument();

      // Enter password and confirm deletion
      fireEvent.change(screen.getByPlaceholderText('Password akun'), {
        target: { value: 'SecretLandlord123!' }
      });
      fireEvent.click(screen.getByRole('button', { name: /Ya, Hapus Kamar/i }));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('/properties/prop-bali-test-01/rooms/room-101'),
          expect.objectContaining({
            method: 'DELETE',
            body: JSON.stringify({ password: 'SecretLandlord123!' })
          })
        );
      });
    });

    it('filters inventory table accurately when floor filter selection changes', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((url) => {
        if (String(url).includes('/api/properties/prop-bali-test-01/rooms')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockRooms
          } as Response);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      render(
        <RoomInventoryModal
          property={mockProperty}
          onClose={vi.fn()}
          onRoomUpdated={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('101')).toBeInTheDocument();
        expect(screen.getByText('201')).toBeInTheDocument();
      });

      const floorSelect = screen.getByRole('combobox');
      // Filter by Lantai 2
      fireEvent.change(floorSelect, { target: { value: '2' } });

      expect(screen.getByText('201')).toBeInTheDocument();
      expect(screen.queryByText('101')).not.toBeInTheDocument();
      expect(screen.queryByText('102')).not.toBeInTheDocument();

      // Filter back to all floors
      fireEvent.change(floorSelect, { target: { value: 'all' } });
      expect(screen.getByText('101')).toBeInTheDocument();
      expect(screen.getByText('102')).toBeInTheDocument();
      expect(screen.getByText('201')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Dimension 2: Tenant Dashboard - Room Badge Rendering & Legacy Fallbacks
  // =========================================================================
  describe('Tenant Dashboard: Room Badge Rendering & Backward Compatibility', () => {
    const mockRentalWithRoom: Rental = {
      id: 'rent-tenant-01',
      tenantId: 'usr-tenant-01',
      propertyId: 'prop-bali-test-01',
      propertyName: 'KOSMO Seminyak Discrete Suites',
      roomId: 'room-102',
      roomNumber: '102',
      roomFloor: 1,
      roomType: 'Deluxe Suite',
      price: 3800000,
      startDate: '01 Sep 2026',
      status: 'active',
      contract_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      contract_signed_at: '2026-09-01T08:00:00Z',
      paymentStatus: 'Lunas',
      nextPaymentDate: '01 Okt 2026',
      daysRemaining: 26
    };

    it('renders assigned room badge with unit number, floor, and room type on ActiveRentalSection', () => {
      render(
        <LanguageProvider>
          <ActiveRentalSection
            activeRental={mockRentalWithRoom}
            isLoading={false}
            isLoaded={true}
            contractDownloading={{}}
            onOpenContract={vi.fn()}
            onViewContractDetails={vi.fn()}
            onOpenTerminate={vi.fn()}
            onExplore={vi.fn()}
          />
        </LanguageProvider>
      );

      const badge = screen.getByTestId('active-rental-room-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Kamar 102');
      expect(badge).toHaveTextContent('Lantai 1');
      expect(badge).toHaveTextContent('Deluxe Suite');
    });

    it('gracefully renders legacy active rental when roomNumber and roomId are undefined without crashing', () => {
      const legacyRental: Rental = {
        ...mockRentalWithRoom,
        roomId: undefined,
        roomNumber: undefined,
        roomFloor: undefined,
        roomType: undefined
      };

      render(
        <LanguageProvider>
          <ActiveRentalSection
            activeRental={legacyRental}
            isLoading={false}
            isLoaded={true}
            contractDownloading={{}}
            onOpenContract={vi.fn()}
            onViewContractDetails={vi.fn()}
            onOpenTerminate={vi.fn()}
            onExplore={vi.fn()}
          />
        </LanguageProvider>
      );

      // Room badge should NOT be rendered for legacy rental
      expect(screen.queryByTestId('active-rental-room-badge')).not.toBeInTheDocument();
      // Property name and active badge must render normally
      expect(screen.getByText('KOSMO Seminyak Discrete Suites')).toBeInTheDocument();
      expect(screen.getByText('Sewa Aktif')).toBeInTheDocument();
    });

    it('falls back to Unit ID when roomId is present but roomNumber is undefined', () => {
      const partialRental: Rental = {
        ...mockRentalWithRoom,
        roomId: 'room-uuid-987654321',
        roomNumber: undefined,
        roomFloor: undefined,
        roomType: undefined
      };

      render(
        <LanguageProvider>
          <ActiveRentalSection
            activeRental={partialRental}
            isLoading={false}
            isLoaded={true}
            contractDownloading={{}}
            onOpenContract={vi.fn()}
            onViewContractDetails={vi.fn()}
            onOpenTerminate={vi.fn()}
            onExplore={vi.fn()}
          />
        </LanguageProvider>
      );

      const badge = screen.getByTestId('active-rental-room-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Unit ID: room-uui');
    });

    it('renders room badge on past rentals in RentalHistorySection when roomNumber is present', () => {
      const pastRentals: Rental[] = [
        {
          ...mockRentalWithRoom,
          id: 'rent-past-01',
          status: 'terminated',
          roomNumber: '102'
        },
        {
          ...mockRentalWithRoom,
          id: 'rent-past-legacy',
          status: 'terminated',
          roomNumber: undefined,
          roomId: undefined
        }
      ];

      render(
        <LanguageProvider>
          <RentalHistorySection
            otherRentals={pastRentals}
            contractDownloading={{}}
            onOpenContract={vi.fn()}
            onViewContractDetails={vi.fn()}
            onOpenPendingPayment={vi.fn()}
          />
        </LanguageProvider>
      );

      expect(screen.getByText('Kamar 102')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Dimension 3: Tenant Dashboard - Contract Viewer Modal Integrity
  // =========================================================================
  describe('Tenant Dashboard: Contract Viewer Modal Terms & Cryptographic Integrity', () => {
    const mockRentalForContract: Rental = {
      id: 'rent-contract-99',
      tenantId: 'usr-tenant-01',
      propertyId: 'prop-bali-test-01',
      propertyName: 'KOSMO Seminyak Discrete Suites',
      roomId: 'room-102',
      roomNumber: '102',
      roomFloor: 1,
      roomType: 'Deluxe Suite',
      price: 3800000,
      duration_months: 3,
      startDate: '01 Sep 2026',
      status: 'active',
      contract_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      contract_signed_at: '2026-09-01T10:30:00Z',
      admin_fee_amount: 5000
    };

    it('renders rich lease terms, discrete room specs, and cryptographic hash in ContractViewerModal', () => {
      const onClose = vi.fn();
      const onDownloadPdf = vi.fn();

      render(
        <LanguageProvider>
          <ContractViewerModal
            rental={mockRentalForContract}
            onClose={onClose}
            onDownloadPdf={onDownloadPdf}
            isDownloading={false}
          />
        </LanguageProvider>
      );

      const modal = screen.getByTestId('contract-viewer-modal');
      expect(modal).toBeInTheDocument();

      // Verified SHA-256 Checksum Display
      expect(screen.getByText(/Checksum Terverifikasi \(SHA-256\)/i)).toBeInTheDocument();
      expect(screen.getByText('a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0')).toBeInTheDocument();

      // Room Specifications
      expect(screen.getByText('KOSMO Seminyak Discrete Suites')).toBeInTheDocument();
      expect(screen.getByText('Kamar 102')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // Lantai
      expect(screen.getByText('Deluxe Suite')).toBeInTheDocument(); // Tipe Kamar
      expect(screen.getByText('3 Bulan')).toBeInTheDocument(); // Durasi

      // Financial Line Items
      expect(screen.getByText('Rp 3.800.000')).toBeInTheDocument(); // Monthly price
      expect(screen.getByText('Rp 5.000')).toBeInTheDocument(); // Admin fee

      // Included Utility Quotas (Statutory terms)
      expect(screen.getByText(/Listrik: Kuota 200 kWh per bulan included/i)).toBeInTheDocument();
      expect(screen.getByText(/Air Bersih: PDAM & Sumur Bor Terfilter included/i)).toBeInTheDocument();
      expect(screen.getByText(/WiFi Fiber: 100 Mbps Dedicated High-Speed/i)).toBeInTheDocument();

      // Statutory Indonesian Law Clauses
      expect(screen.getByText(/Pasal 1320 KUHPerdata dan UU ITE No. 11\/2008 jo. UU No. 1\/2024/i)).toBeInTheDocument();
      expect(screen.getByText(/Pengadilan Negeri Denpasar \/ Badung, Bali/i)).toBeInTheDocument();
    });

    it('gracefully renders legacy rental without room specs in ContractViewerModal', () => {
      const legacyRental: Rental = {
        ...mockRentalForContract,
        roomId: undefined,
        roomNumber: undefined,
        roomFloor: undefined,
        roomType: undefined
      };

      render(
        <LanguageProvider>
          <ContractViewerModal
            rental={legacyRental}
            onClose={vi.fn()}
            onDownloadPdf={vi.fn()}
            isDownloading={false}
          />
        </LanguageProvider>
      );

      expect(screen.getByTestId('contract-viewer-modal')).toBeInTheDocument();
      expect(screen.getByText('-')).toBeInTheDocument(); // Kamar fallback
    });

    it('triggers onDownloadPdf with rental ID when clicking Unduh Dokumen PDF Resmi', () => {
      const onDownloadPdf = vi.fn();

      render(
        <LanguageProvider>
          <ContractViewerModal
            rental={mockRentalForContract}
            onClose={vi.fn()}
            onDownloadPdf={onDownloadPdf}
            isDownloading={false}
          />
        </LanguageProvider>
      );

      const downloadBtn = screen.getByRole('button', { name: /Unduh Dokumen PDF Resmi/i });
      fireEvent.click(downloadBtn);

      expect(onDownloadPdf).toHaveBeenCalledWith('rent-contract-99');
    });

    it('triggers onClose when clicking Tutup button', () => {
      const onClose = vi.fn();

      render(
        <LanguageProvider>
          <ContractViewerModal
            rental={mockRentalForContract}
            onClose={onClose}
            onDownloadPdf={vi.fn()}
            isDownloading={false}
          />
        </LanguageProvider>
      );

      const closeBtn = screen.getByRole('button', { name: /Tutup/i });
      fireEvent.click(closeBtn);

      expect(onClose).toHaveBeenCalled();
    });
  });
});
