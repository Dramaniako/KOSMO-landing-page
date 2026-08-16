import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchFilterBar from '../SearchFilterBar.tsx';
import { FacilityFilterState } from '../../types/index.ts';

describe('SearchFilterBar Component', () => {
  const initialFacilities: FacilityFilterState = {
    Listrik: false,
    Air: true,
    Wifi: true,
    Kebersihan: false,
    Keamanan: false,
    Parkir: false
  };

  const mockRenderIcon = (name: string) => <span data-testid={`icon-${name}`}>{name}</span>;

  it('renders all filter controls, district options, and price indicator', () => {
    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMax={5000000}
        setPriceMax={vi.fn()}
        facilities={initialFacilities}
        toggleFacility={vi.fn()}
        handleSearch={vi.fn()}
        resetFilters={vi.fn()}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    expect(screen.getByLabelText(/wilayah di bali/i)).toBeInTheDocument();
    expect(screen.getByText(/5\.000\.000/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cari kos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wifi/i })).toBeInTheDocument();
  });

  it('triggers setDistrict when selecting another district', () => {
    const setDistrict = vi.fn();
    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={setDistrict}
        priceMax={5000000}
        setPriceMax={vi.fn()}
        facilities={initialFacilities}
        toggleFacility={vi.fn()}
        handleSearch={vi.fn()}
        resetFilters={vi.fn()}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    const select = screen.getByLabelText(/wilayah di bali/i);
    fireEvent.change(select, { target: { value: 'Badung' } });

    expect(setDistrict).toHaveBeenCalledWith('Badung');
  });

  it('triggers setPriceMax when moving the range slider', () => {
    const setPriceMax = vi.fn();
    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMax={5000000}
        setPriceMax={setPriceMax}
        facilities={initialFacilities}
        toggleFacility={vi.fn()}
        handleSearch={vi.fn()}
        resetFilters={vi.fn()}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '7500000' } });

    expect(setPriceMax).toHaveBeenCalledWith(7500000);
  });

  it('triggers toggleFacility when clicking a facility pill', () => {
    const toggleFacility = vi.fn();
    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMax={5000000}
        setPriceMax={vi.fn()}
        facilities={initialFacilities}
        toggleFacility={toggleFacility}
        handleSearch={vi.fn()}
        resetFilters={vi.fn()}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    const wifiButton = screen.getByRole('button', { name: /wifi/i });
    fireEvent.click(wifiButton);

    expect(toggleFacility).toHaveBeenCalledWith('Wifi');
  });

  it('triggers handleSearch on submit and resetFilters on reset button click', () => {
    const handleSearch = vi.fn((e: React.FormEvent) => e.preventDefault());
    const resetFilters = vi.fn();

    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMax={5000000}
        setPriceMax={vi.fn()}
        facilities={initialFacilities}
        toggleFacility={vi.fn()}
        handleSearch={handleSearch}
        resetFilters={resetFilters}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    const searchButton = screen.getByRole('button', { name: /cari kos/i });
    fireEvent.click(searchButton);
    expect(handleSearch).toHaveBeenCalled();

    const resetButton = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetButton);
    expect(resetFilters).toHaveBeenCalled();
  });
});
