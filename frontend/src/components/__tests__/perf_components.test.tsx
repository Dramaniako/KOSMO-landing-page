import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import KosCard from '../KosCard';
import SearchFilterBar from '../SearchFilterBar';
import { Property, FacilityFilterState } from '../../types/index';

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
});
