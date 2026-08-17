import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KosCard from '../KosCard';
import { Property } from '../../types/index';

describe('KosCard Component', () => {
  const mockPropertyAvailable: Property = {
    id: 'prop-001',
    name: 'KOSMO Hub Seminyak',
    district: 'Badung',
    address: 'Jl. Kayu Aya No. 18, Seminyak',
    price: 3500000,
    rating: 4.8,
    image: 'https://example.com/kos.jpg',
    description: 'Modern co-living space',
    facilities: ['Wifi', 'AC', 'Listrik', 'Air', 'Kebersihan'],
    latitude: '-8.6890',
    longitude: '115.1580',
    totalRooms: 10,
    occupiedRooms: 8,
    ownerId: 'landlord-1'
  };

  const mockPropertyFull: Property = {
    ...mockPropertyAvailable,
    id: 'prop-002',
    name: 'KOSMO Sunset Kuta',
    totalRooms: 5,
    occupiedRooms: 5
  };

  const mockRenderIcon = (name: string) => <span data-testid={`icon-${name}`} />;

  it('renders property title, district location, and price correctly', () => {
    const handleOpenDetail = vi.fn();
    render(
      <KosCard
        property={mockPropertyAvailable}
        onOpenDetail={handleOpenDetail}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    expect(screen.getByText('KOSMO Hub Seminyak')).toBeInTheDocument();
    expect(screen.getByText('Badung, Bali')).toBeInTheDocument();
    expect(screen.getByText(/3\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText('/bulan')).toBeInTheDocument();
  });

  it('renders remaining room badge when rooms are available', () => {
    const handleOpenDetail = vi.fn();
    render(
      <KosCard
        property={mockPropertyAvailable}
        onOpenDetail={handleOpenDetail}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    expect(screen.getByText('Sisa 2 Kamar')).toBeInTheDocument();
  });

  it('renders "Penuh" badge when all rooms are occupied', () => {
    const handleOpenDetail = vi.fn();
    render(
      <KosCard
        property={mockPropertyFull}
        onOpenDetail={handleOpenDetail}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    expect(screen.getByText('Penuh')).toBeInTheDocument();
  });

  it('renders facility pills and handles overflow counts', () => {
    const handleOpenDetail = vi.fn();
    render(
      <KosCard
        property={mockPropertyAvailable}
        onOpenDetail={handleOpenDetail}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    expect(screen.getByText('Wifi')).toBeInTheDocument();
    expect(screen.getByText('AC')).toBeInTheDocument();
    expect(screen.getByText('Listrik')).toBeInTheDocument();
    expect(screen.getByText('Air')).toBeInTheDocument();
    // 5th facility rendered as +1
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('calls onOpenDetail when card or detail button is clicked', () => {
    const handleOpenDetail = vi.fn();
    render(
      <KosCard
        property={mockPropertyAvailable}
        onOpenDetail={handleOpenDetail}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    const detailButton = screen.getByRole('button', { name: /detail/i });
    fireEvent.click(detailButton);
    expect(handleOpenDetail).toHaveBeenCalledWith(mockPropertyAvailable);
  });
});
