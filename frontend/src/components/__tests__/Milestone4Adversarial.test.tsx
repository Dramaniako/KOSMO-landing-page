import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Property, Room, PropertyPhoto, User } from '../../types/index';
import { LanguageProvider } from '../../context/LanguageContext';
import { PropertyPhotoGallery } from '../BookingModal/components/PropertyPhotoGallery';
import { RoomSelectionGrid } from '../BookingModal/components/RoomSelectionGrid';
import BookingPropertyDetailView from '../BookingModal/components/BookingPropertyDetailView';
import ContractSigningView from '../BookingModal/components/ContractSigningView';

describe('Milestone 4 Adversarial Stress Harness', () => {
  const baseProperty: Property = {
    id: 'prop-m4-adv-01',
    name: 'KOSMO Seminyak Suite',
    district: 'Badung',
    address: 'Jl. Kayu Aya No. 99, Seminyak, Badung, Bali',
    price: 3000000,
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
    description: 'Boutique residence in Seminyak.',
    facilities: ['Wifi', 'AC', 'Kolam Renang'],
    latitude: '-8.6833',
    longitude: '115.1572',
    totalRooms: 3,
    occupiedRooms: 1,
    ownerId: 'owner-m4-01'
  };

  const sampleRooms: Room[] = [
    {
      id: 'room-101',
      propertyId: 'prop-m4-adv-01',
      roomNumber: '101',
      floor: 1,
      type: 'Deluxe Queen',
      price: 3000000,
      status: 'available'
    },
    {
      id: 'room-102',
      propertyId: 'prop-m4-adv-01',
      roomNumber: '102',
      floor: 1,
      type: 'Deluxe Queen',
      price: 3000000,
      status: 'occupied'
    },
    {
      id: 'room-103',
      propertyId: 'prop-m4-adv-01',
      roomNumber: '103',
      floor: 1,
      type: 'Standard Single',
      price: 2800000,
      status: 'maintenance'
    },
    {
      id: 'room-201',
      propertyId: 'prop-m4-adv-01',
      roomNumber: '201',
      floor: 2,
      type: 'Executive Balcony',
      price: 4500000,
      status: 'available'
    }
  ];

  const mockUser: User = {
    id: 'usr-m4-tenant',
    name: 'Wayan Challenger',
    email: 'wayan@kosmo.test',
    role: 'tenant',
    phone: '081234567890',
    identity_type: 'NIK',
    identity_number: '5171012304950001',
    address: 'Jl. Sunset Road No. 88, Badung',
    occupation: 'Security Researcher',
    emergency_contact_name: 'Made Partha',
    emergency_contact_phone: '081234567899'
  };

  describe('Adversarial Dimension 1: Empty Photo Gallery Fallback Robustness', () => {
    it('renders hero image fallback gracefully when photos array is completely empty', () => {
      render(
        <LanguageProvider>
          <PropertyPhotoGallery property={baseProperty} photos={[]} />
        </LanguageProvider>
      );

      const heroImg = screen.getByTestId('gallery-hero-image') as HTMLImageElement;
      expect(heroImg).toBeInTheDocument();
      expect(heroImg.src).toBe(baseProperty.image);

      // Verify category tab shows Semua (1) for the fallback cover
      expect(screen.getByTestId('category-filter-all')).toHaveTextContent('Semua (1)');
      // Thumbnail filmstrip should be omitted since only 1 fallback photo exists
      expect(screen.queryByTestId('gallery-thumb-1')).not.toBeInTheDocument();
      // Navigation arrows should be omitted
      expect(screen.queryByTestId('gallery-next-btn')).not.toBeInTheDocument();
    });

    it('gracefully handles user selecting non-matching category on empty photo gallery without crashing', () => {
      render(
        <LanguageProvider>
          <PropertyPhotoGallery property={baseProperty} photos={[]} />
        </LanguageProvider>
      );

      // Click "Kamar Tidur" filter tab when only fallback cover exists
      const bedroomTab = screen.getByTestId('category-filter-bedroom');
      fireEvent.click(bedroomTab);

      // Should still render fallback hero image without throwing error
      const heroImg = screen.getByTestId('gallery-hero-image') as HTMLImageElement;
      expect(heroImg).toBeInTheDocument();
      expect(heroImg.src).toBe(baseProperty.image);
    });

    it('opens and closes fullscreen lightbox modal cleanly when viewing fallback photo', () => {
      render(
        <LanguageProvider>
          <PropertyPhotoGallery property={baseProperty} photos={[]} />
        </LanguageProvider>
      );

      const heroImg = screen.getByTestId('gallery-hero-image');
      fireEvent.click(heroImg);

      const lightbox = screen.getByTestId('gallery-lightbox');
      expect(lightbox).toBeInTheDocument();

      const closeBtn = screen.getByRole('button', { name: /Tutup Lightbox/i });
      fireEvent.click(closeBtn);
      expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();
    });

    it('supports keyboard navigation (ArrowRight, ArrowLeft, Escape) in fullscreen lightbox modal with clean listener teardown', () => {
      const multiPhotos: PropertyPhoto[] = [
        { id: 'p1', propertyId: 'prop-1', url: 'https://example.com/1.jpg', category: 'bedroom', caption: 'Photo 1', orderIndex: 0 },
        { id: 'p2', propertyId: 'prop-1', url: 'https://example.com/2.jpg', category: 'bedroom', caption: 'Photo 2', orderIndex: 1 },
        { id: 'p3', propertyId: 'prop-1', url: 'https://example.com/3.jpg', category: 'bedroom', caption: 'Photo 3', orderIndex: 2 },
      ];

      render(
        <LanguageProvider>
          <PropertyPhotoGallery property={baseProperty} photos={multiPhotos} />
        </LanguageProvider>
      );

      // 1. Open fullscreen lightbox modal
      const heroImg = screen.getByTestId('gallery-hero-image');
      fireEvent.click(heroImg);
      const lightbox = screen.getByTestId('gallery-lightbox');
      expect(lightbox).toBeInTheDocument();
      expect(screen.getByText('1 / 3')).toBeInTheDocument();

      // 2. Press ArrowRight -> Navigates to Photo 2
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('2 / 3')).toBeInTheDocument();

      // 3. Press ArrowRight -> Navigates to Photo 3
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('3 / 3')).toBeInTheDocument();

      // 4. Press ArrowRight -> Wraps around back to Photo 1
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('1 / 3')).toBeInTheDocument();

      // 5. Press ArrowLeft -> Wraps around backwards to Photo 3
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText('3 / 3')).toBeInTheDocument();

      // 6. Press ArrowLeft -> Navigates back to Photo 2
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText('2 / 3')).toBeInTheDocument();

      // 7. Press Escape -> Closes lightbox modal
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();

      // 8. Verify listener teardown: pressing keys when closed does not trigger state updates or errors
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();
    });
  });

  describe('Adversarial Dimension 2: Zero Available Rooms Gating & Empty States', () => {
    it('displays clear empty state notice when room inventory is completely empty', () => {
      render(
        <RoomSelectionGrid
          rooms={[]}
          selectedRoom={null}
          onSelectRoom={vi.fn()}
          basePrice={3000000}
        />
      );

      expect(screen.getByText('Belum ada kamar yang tersedia saat ini.')).toBeInTheDocument();
      expect(screen.queryByTestId('room-selection-grid')).not.toBeInTheDocument();
    });

    it('strictly blocks booking progression in BookingPropertyDetailView when rooms array is empty', () => {
      const onBookNow = vi.fn();
      render(
        <LanguageProvider>
          <BookingPropertyDetailView
            property={baseProperty}
            image={baseProperty.image}
            price={baseProperty.price}
            totalRooms={3}
            occupiedRooms={1}
            availableRooms={2}
            isFull={false}
            facilities={['Wifi']}
            renderFacilityIcon={(fac: string) => <span>{fac}</span>}
            showMap={false}
            setShowMap={vi.fn()}
            hasActiveRental={false}
            activeRentalError={null}
            currentUser={mockUser}
            profileStatus={{ complete: true, missingFields: [], missingFieldLabels: [] }}
            rooms={[]}
            selectedRoom={null}
            onSelectRoom={vi.fn()}
            onClose={vi.fn()}
            onBookNow={onBookNow}
            onNavigateToLogin={vi.fn()}
          />
        </LanguageProvider>
      );

      const bookBtn = screen.getByRole('button', { name: /Sewa Sekarang/i });
      expect(bookBtn).toBeDisabled();

      fireEvent.click(bookBtn);
      expect(onBookNow).not.toHaveBeenCalled();
    });

    it('strictly blocks booking progression when rooms exist but all are occupied or in maintenance', () => {
      const unavailableRooms: Room[] = [
        {
          id: 'room-x1',
          propertyId: 'prop-m4-adv-01',
          roomNumber: '101',
          floor: 1,
          type: 'Standard',
          price: 3000000,
          status: 'occupied'
        },
        {
          id: 'room-x2',
          propertyId: 'prop-m4-adv-01',
          roomNumber: '102',
          floor: 1,
          type: 'Standard',
          price: 3000000,
          status: 'maintenance'
        }
      ];

      const onBookNow = vi.fn();
      render(
        <LanguageProvider>
          <BookingPropertyDetailView
            property={baseProperty}
            image={baseProperty.image}
            price={baseProperty.price}
            totalRooms={2}
            occupiedRooms={1}
            availableRooms={0}
            isFull={false}
            facilities={['Wifi']}
            renderFacilityIcon={(fac: string) => <span>{fac}</span>}
            showMap={false}
            setShowMap={vi.fn()}
            hasActiveRental={false}
            activeRentalError={null}
            currentUser={mockUser}
            profileStatus={{ complete: true, missingFields: [], missingFieldLabels: [] }}
            rooms={unavailableRooms}
            selectedRoom={null}
            onSelectRoom={vi.fn()}
            onClose={vi.fn()}
            onBookNow={onBookNow}
            onNavigateToLogin={vi.fn()}
          />
        </LanguageProvider>
      );

      // Book button must be disabled because no room is (or can be) selected
      const bookBtn = screen.getByRole('button', { name: /Sewa Sekarang/i });
      expect(bookBtn).toBeDisabled();

      fireEvent.click(bookBtn);
      expect(onBookNow).not.toHaveBeenCalled();
    });

    it('strictly blocks booking progression when discrete rooms are enabled, rooms exist, but none is selected', () => {
      const onBookNow = vi.fn();
      render(
        <LanguageProvider>
          <BookingPropertyDetailView
            property={baseProperty}
            image={baseProperty.image}
            price={baseProperty.price}
            totalRooms={3}
            occupiedRooms={1}
            availableRooms={2}
            isFull={false}
            facilities={['Wifi']}
            renderFacilityIcon={(fac: string) => <span>{fac}</span>}
            showMap={false}
            setShowMap={vi.fn()}
            hasActiveRental={false}
            activeRentalError={null}
            currentUser={mockUser}
            profileStatus={{ complete: true, missingFields: [], missingFieldLabels: [] }}
            rooms={sampleRooms}
            selectedRoom={null}
            onSelectRoom={vi.fn()}
            onClose={vi.fn()}
            onBookNow={onBookNow}
            onNavigateToLogin={vi.fn()}
          />
        </LanguageProvider>
      );

      const bookBtn = screen.getByRole('button', { name: /Sewa Sekarang/i });
      expect(bookBtn).toBeDisabled();

      fireEvent.click(bookBtn);
      expect(onBookNow).not.toHaveBeenCalled();
    });

    it('enables booking progression when discrete rooms are enabled, room is selected, and profile is complete', () => {
      const onBookNow = vi.fn();
      render(
        <LanguageProvider>
          <BookingPropertyDetailView
            property={baseProperty}
            image={baseProperty.image}
            price={baseProperty.price}
            totalRooms={3}
            occupiedRooms={1}
            availableRooms={2}
            isFull={false}
            facilities={['Wifi']}
            renderFacilityIcon={(fac: string) => <span>{fac}</span>}
            showMap={false}
            setShowMap={vi.fn()}
            hasActiveRental={false}
            activeRentalError={null}
            currentUser={mockUser}
            profileStatus={{ complete: true, missingFields: [], missingFieldLabels: [] }}
            rooms={sampleRooms}
            selectedRoom={sampleRooms[0]}
            onSelectRoom={vi.fn()}
            onClose={vi.fn()}
            onBookNow={onBookNow}
            onNavigateToLogin={vi.fn()}
          />
        </LanguageProvider>
      );

      const bookBtn = screen.getByRole('button', { name: /Sewa Sekarang/i });
      expect(bookBtn).not.toBeDisabled();

      fireEvent.click(bookBtn);
      expect(onBookNow).toHaveBeenCalledTimes(1);
    });

    it('enables legacy booking flow when onSelectRoom is undefined even without room selection', () => {
      const onBookNow = vi.fn();
      render(
        <LanguageProvider>
          <BookingPropertyDetailView
            property={baseProperty}
            image={baseProperty.image}
            price={baseProperty.price}
            totalRooms={3}
            occupiedRooms={1}
            availableRooms={2}
            isFull={false}
            facilities={['Wifi']}
            renderFacilityIcon={(fac: string) => <span>{fac}</span>}
            showMap={false}
            setShowMap={vi.fn()}
            hasActiveRental={false}
            activeRentalError={null}
            currentUser={mockUser}
            profileStatus={{ complete: true, missingFields: [], missingFieldLabels: [] }}
            rooms={[]}
            selectedRoom={null}
            onSelectRoom={undefined}
            onClose={vi.fn()}
            onBookNow={onBookNow}
            onNavigateToLogin={vi.fn()}
          />
        </LanguageProvider>
      );

      const bookBtn = screen.getByRole('button', { name: /Sewa Sekarang/i });
      expect(bookBtn).not.toBeDisabled();

      fireEvent.click(bookBtn);
      expect(onBookNow).toHaveBeenCalledTimes(1);
    });
  });

  describe('Adversarial Dimension 3: Occupied and Maintenance Room Selection Blocking', () => {
    it('disables occupied and maintenance room cards and ignores click events', () => {
      const onSelectRoom = vi.fn();
      render(
        <RoomSelectionGrid
          rooms={sampleRooms}
          selectedRoom={null}
          onSelectRoom={onSelectRoom}
          basePrice={3000000}
        />
      );

      // Check occupied room 102
      const room102 = screen.getByTestId('room-card-102');
      expect(room102).toBeDisabled();
      expect(room102).toHaveAttribute('data-status', 'occupied');
      expect(room102).toHaveTextContent('Terisi');

      fireEvent.click(room102);
      expect(onSelectRoom).not.toHaveBeenCalled();

      // Check maintenance room 103
      const room103 = screen.getByTestId('room-card-103');
      expect(room103).toBeDisabled();
      expect(room103).toHaveAttribute('data-status', 'maintenance');
      expect(room103).toHaveTextContent('Pemeliharaan');

      fireEvent.click(room103);
      expect(onSelectRoom).not.toHaveBeenCalled();
    });

    it('allows selection ONLY on available room and triggers onSelectRoom callback', () => {
      const onSelectRoom = vi.fn();
      render(
        <RoomSelectionGrid
          rooms={sampleRooms}
          selectedRoom={null}
          onSelectRoom={onSelectRoom}
          basePrice={3000000}
        />
      );

      const room101 = screen.getByTestId('room-card-101');
      expect(room101).not.toBeDisabled();
      expect(room101).toHaveAttribute('data-status', 'available');

      fireEvent.click(room101);
      expect(onSelectRoom).toHaveBeenCalledTimes(1);
      expect(onSelectRoom).toHaveBeenCalledWith(sampleRooms[0]);
    });
  });

  describe('Adversarial Dimension 4: Price Override Multi-Month Lease Consistency', () => {
    const overriddenRoom: Room = {
      id: 'room-201',
      propertyId: 'prop-m4-adv-01',
      roomNumber: '201',
      floor: 2,
      type: 'Executive Balcony',
      price: 4500000,
      effectivePrice: 4500000,
      status: 'available'
    };

    it('displays overridden monthly rate in BookingPropertyDetailView header', () => {
      render(
        <LanguageProvider>
          <BookingPropertyDetailView
            property={baseProperty}
            image={baseProperty.image}
            price={baseProperty.price}
            totalRooms={3}
            occupiedRooms={1}
            availableRooms={2}
            isFull={false}
            facilities={['Wifi']}
            renderFacilityIcon={(fac: string) => <span>{fac}</span>}
            showMap={false}
            setShowMap={vi.fn()}
            hasActiveRental={false}
            activeRentalError={null}
            currentUser={mockUser}
            profileStatus={{ complete: true, missingFields: [], missingFieldLabels: [] }}
            rooms={sampleRooms}
            selectedRoom={overriddenRoom}
            onSelectRoom={vi.fn()}
            onClose={vi.fn()}
            onBookNow={vi.fn()}
            onNavigateToLogin={vi.fn()}
          />
        </LanguageProvider>
      );

      // The header price should display Rp 4.500.000 instead of base Rp 3.000.000
      const priceContainer = document.querySelector('.property-price');
      expect(priceContainer).toHaveTextContent('Rp 4.500.000');
    });

    it('computes exact multi-month pricing and flat Rp 5.000 admin fee with price override in ContractSigningView', () => {
      const flatAdminFee = 5000;
      const durationMonths = 12;
      const effectiveMonthlyPrice = 4500000;
      const calculatedTotalRent = effectiveMonthlyPrice * durationMonths; // 54,000,000
      const calculatedTotalAmount = calculatedTotalRent + flatAdminFee; // 54,005,000

      render(
        <LanguageProvider>
          <ContractSigningView
            property={baseProperty}
            selectedRoom={overriddenRoom}
            currentUser={mockUser}
            activeRentalError={null}
            hasActiveRental={false}
            profileStatus={{ complete: true, missingFields: [], missingFieldLabels: [] }}
            idType="NIK"
            idNumber="5171012304950001"
            idTouched={false}
            idValidationMsg={null}
            isIdValid={true}
            handleIdChange={vi.fn()}
            handleIdTypeChange={vi.fn()}
            startDate="2026-09-10"
            setStartDate={vi.fn()}
            durationMonths={durationMonths}
            setDurationMonths={vi.fn()}
            calculatedTotalRent={calculatedTotalRent}
            flatAdminFee={flatAdminFee}
            calculatedTotalAmount={calculatedTotalAmount}
            previewLoading={false}
            handleFetchPreview={vi.fn()}
            termsContainerRef={React.createRef()}
            handleTermsScroll={vi.fn()}
            scrollError={null}
            hasScrolledToBottom={true}
            affirmativeConsent={true}
            setAffirmativeConsent={vi.fn()}
            consentError={null}
            setConsentError={vi.fn()}
            canvasRef={React.createRef()}
            hasDrawnSignature={true}
            signatureConfirmed={true}
            signatureError={null}
            handlePointerDown={vi.fn()}
            handlePointerMove={vi.fn()}
            handlePointerUp={vi.fn()}
            handleClearSignature={vi.fn()}
            handleConfirmSignature={vi.fn()}
            onCancel={vi.fn()}
            onSubmit={vi.fn()}
            isSigning={false}
            contractSigned={false}
          />
        </LanguageProvider>
      );

      // Selected Room Unit Banner
      const roomBanner = screen.getByTestId('selected-room-banner');
      expect(roomBanner).toHaveTextContent('Unit Kamar: 201 (Lantai 2 - Executive Balcony)');
      expect(roomBanner).toHaveTextContent('Rp 4.500.000/bln');

      // Duration select dropdown shows options computed with overridden price
      const durationSelect = screen.getByTestId('duration-select');
      expect(durationSelect).toBeInTheDocument();
      expect(durationSelect).toHaveTextContent('12 Bulan (Rp 54.000.000)');
      expect(durationSelect).toHaveTextContent('6 Bulan (Rp 27.000.000)');
      expect(durationSelect).toHaveTextContent('1 Bulan (Rp 4.500.000)');

      // Financial breakdown card
      expect(screen.getByText(/Sewa Kamar Bulanan \(12 bln\)/i)).toBeInTheDocument();
      expect(screen.getByText('Rp 54.000.000')).toBeInTheDocument();
      expect(screen.getByText('Rp 5.000')).toBeInTheDocument();
      expect(screen.getByText('Rp 54.005.000')).toBeInTheDocument();
    });
  });
});
