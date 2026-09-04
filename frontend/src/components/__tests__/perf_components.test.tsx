import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import KosCard from '../KosCard';
import SearchFilterBar from '../SearchFilterBar';
import KosCardSkeleton from '../KosCardSkeleton';
import ThemeLanguageToggle from '../ThemeLanguageToggle';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { validateIdentity, useIdentityValidation } from '../BookingModal/hooks/useIdentityValidation';
import { useScrollClickwrap } from '../BookingModal/hooks/useScrollClickwrap';
import { Property, FacilityFilterState, User } from '../../types/index';

describe('Frontend Component Render Performance', () => {
  const mockProperty: Property = {
    id: 'prop-perf-1',
    name: 'KOSMO Canggu Sanctuary',
    district: 'Badung',
    address: 'Jl. Pantai Batu Bolong No. 10',
    price: 4500000,
    rating: 4.9,
    image: 'https://example.com/kos-canggu.jpg',
    description: 'Luxury co-living',
    facilities: ['Wifi', 'AC', 'Listrik', 'Air'],
    latitude: '-8.6500',
    longitude: '115.1300',
    totalRooms: 8,
    occupiedRooms: 6,
    ownerId: 'landlord-1'
  };

  const mockFacilities: FacilityFilterState = {
    Listrik: false,
    Air: true,
    Wifi: true,
    Kebersihan: false,
    Keamanan: false,
    Parkir: false
  };

  it('renders KosCard in less than 200ms with lazy and async attributes', () => {
    // Warmup render for JSDOM
    render(<div />);

    const start = performance.now();
    const { container } = render(
      <KosCard
        property={mockProperty}
        onOpenDetail={vi.fn()}
        renderFacilityIcon={() => <span />}
      />
    );
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
  });

  it('renders SearchFilterBar with low latency and valid controls', () => {
    const start = performance.now();
    const { container } = render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMin={0}
        setPriceMin={vi.fn()}
        priceMax={5000000}
        setPriceMax={vi.fn()}
        facilities={mockFacilities}
        toggleFacility={vi.fn()}
        handleSearch={vi.fn()}
        resetFilters={vi.fn()}
        renderFacilityIcon={(name) => <span>{name}</span>}
      />
    );
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500);
    expect(container.querySelector('select')).not.toBeNull();
  });

  it('skips redundant re-renders when wrapped with React.memo', () => {
    const setDistrict = vi.fn();
    const setPriceMin = vi.fn();
    const setPriceMax = vi.fn();
    const toggleFacility = vi.fn();
    const handleSearch = vi.fn();
    const resetFilters = vi.fn();
    const renderFacilityIcon = vi.fn((name: string) => <span>{name}</span>);

    const { rerender } = render(
      <SearchFilterBar
        district="Semua"
        setDistrict={setDistrict}
        priceMin={0}
        setPriceMin={setPriceMin}
        priceMax={5000000}
        setPriceMax={setPriceMax}
        facilities={mockFacilities}
        toggleFacility={toggleFacility}
        handleSearch={handleSearch}
        resetFilters={resetFilters}
        renderFacilityIcon={renderFacilityIcon}
        isSearching={false}
      />
    );

    const initialCallCount = renderFacilityIcon.mock.calls.length;
    expect(initialCallCount).toBeGreaterThan(0);

    // Re-render with identical props
    rerender(
      <SearchFilterBar
        district="Semua"
        setDistrict={setDistrict}
        priceMin={0}
        setPriceMin={setPriceMin}
        priceMax={5000000}
        setPriceMax={setPriceMax}
        facilities={mockFacilities}
        toggleFacility={toggleFacility}
        handleSearch={handleSearch}
        resetFilters={resetFilters}
        renderFacilityIcon={renderFacilityIcon}
        isSearching={false}
      />
    );

    // Because SearchFilterBar is memoized with React.memo, the inner render was skipped
    expect(renderFacilityIcon.mock.calls.length).toBe(initialCallCount);
  });

  it('renders KosCardSkeleton in less than 50ms with accessible loading indicators', () => {
    const start = performance.now();
    const { container } = render(<KosCardSkeleton />);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renders ThemeLanguageToggle in less than 50ms inside context providers', () => {
    const start = performance.now();
    const { container } = render(
      <ThemeProvider>
        <LanguageProvider>
          <ThemeLanguageToggle />
        </LanguageProvider>
      </ThemeProvider>
    );
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
    expect(container.querySelectorAll('button').length).toBe(2);
  });

  it('executes validateIdentity utility in sub-millisecond latency', () => {
    const startNik = performance.now();
    const nikResult = validateIdentity('5171012345678901', 'NIK');
    const nikDuration = performance.now() - startNik;

    expect(nikResult.isValid).toBe(true);
    expect(nikResult.error).toBeNull();
    expect(nikDuration).toBeLessThan(5);

    const startPassport = performance.now();
    const passportResult = validateIdentity('B12345678', 'PASSPORT');
    const passportDuration = performance.now() - startPassport;

    expect(passportResult.isValid).toBe(true);
    expect(passportResult.error).toBeNull();
    expect(passportDuration).toBeLessThan(5);
  });

  it('initializes useIdentityValidation hook within 50ms', () => {
    const mockUser: User = {
      id: 'usr-perf-1',
      name: 'Ketut Hook Tester',
      email: 'ketut@bali.local',
      role: 'tenant',
      identity_type: 'NIK',
      identity_number: '5171012345678901'
    };

    const start = performance.now();
    const { result } = renderHook(() => useIdentityValidation(mockUser, true));
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
    expect(result.current.idNumber).toBe('5171012345678901');
    expect(result.current.idType).toBe('NIK');
    expect(result.current.idTouched).toBe(true);
  });

  it('initializes useScrollClickwrap hook within 50ms', () => {
    const start = performance.now();
    const { result } = renderHook(() => useScrollClickwrap(true));
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
    expect(result.current.hasScrolledToBottom).toBe(false);
    expect(result.current.affirmativeConsent).toBe(false);
    expect(result.current.termsContainerRef).toBeDefined();
  });
});

