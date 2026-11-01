import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PropertiesTab from '../../pages/AdminDashboard/components/PropertiesTab';
import { Property } from '../../types/index';

describe('Admin PropertiesTab Component Suite', () => {
  const mockProperties: Property[] = [
    {
      id: 'prop-1',
      name: 'KOSMO Canggu Sanctuary',
      district: 'Canggu',
      address: 'Jl. Batu Bolong No. 12',
      price: 3500000,
      occupiedRooms: 4,
      totalRooms: 5,
      rating: 4.8,
      ownerId: 'landlord-1',
      image: '/images/kos1.jpg',
      description: 'Cozy coliving in Canggu',
      facilities: ['Wifi', 'AC'],
      latitude: '-8.6500',
      longitude: '115.1300',
      is_featured: true,
      isFeatured: true
    },
    {
      id: 'prop-2',
      name: 'KOSMO Seminyak Breeze',
      district: 'Seminyak',
      address: 'Jl. Kayu Aya No. 8',
      price: 4500000,
      occupiedRooms: 2,
      totalRooms: 6,
      rating: 4.5,
      ownerId: 'landlord-2',
      image: '/images/kos2.jpg',
      description: 'Modern kos in Seminyak',
      facilities: ['Wifi', 'Pool'],
      latitude: '-8.6900',
      longitude: '115.1600',
      is_featured: false,
      isFeatured: false
    }
  ];

  it('renders properties list with status, rating, and owner details', () => {
    render(
      <PropertiesTab
        properties={mockProperties}
        loading={false}
        onEditProperty={vi.fn()}
        onDeleteProperty={vi.fn()}
      />
    );

    expect(screen.getByText('KOSMO Canggu Sanctuary')).toBeInTheDocument();
    expect(screen.getByText('KOSMO Seminyak Breeze')).toBeInTheDocument();
    expect(screen.getByText('Canggu')).toBeInTheDocument();
    expect(screen.getByText('Seminyak')).toBeInTheDocument();
  });

  it('filters properties by search query (name, district, address)', () => {
    render(
      <PropertiesTab
        properties={mockProperties}
        loading={false}
        onEditProperty={vi.fn()}
        onDeleteProperty={vi.fn()}
      />
    );

    const input = screen.getByTestId('properties-search-input');
    fireEvent.change(input, { target: { value: 'Kayu Aya' } });

    expect(screen.getByText('KOSMO Seminyak Breeze')).toBeInTheDocument();
    expect(screen.queryByText('KOSMO Canggu Sanctuary')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('properties-search-clear'));
    expect(screen.getByText('KOSMO Canggu Sanctuary')).toBeInTheDocument();
  });

  it('triggers onToggleFeatured when clicking 1-click featured button', async () => {
    const onToggleFeatured = vi.fn().mockResolvedValue(undefined);
    render(
      <PropertiesTab
        properties={mockProperties}
        loading={false}
        onEditProperty={vi.fn()}
        onDeleteProperty={vi.fn()}
        onToggleFeatured={onToggleFeatured}
      />
    );

    const toggleBtn = screen.getByTestId('toggle-featured-prop-2');
    expect(toggleBtn).toHaveTextContent('Reguler');

    fireEvent.click(toggleBtn);
    await waitFor(() => {
      expect(onToggleFeatured).toHaveBeenCalledWith(mockProperties[1]);
    });
  });
});
