import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchFilterBar from '../SearchFilterBar';
import { FacilityFilterState } from '../../types/index';

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

  it('renders all filter controls, district options, and dual price inputs', () => {
    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMin={1000000}
        setPriceMin={vi.fn()}
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
    expect(screen.getByLabelText(/harga minimum/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/harga maksimum/i)).toBeInTheDocument();
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
        priceMin={0}
        setPriceMin={vi.fn()}
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

  it('triggers setPriceMin when typing in the minimum price input', () => {
    const setPriceMin = vi.fn();
    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMin={0}
        setPriceMin={setPriceMin}
        priceMax={10000000}
        setPriceMax={vi.fn()}
        facilities={initialFacilities}
        toggleFacility={vi.fn()}
        handleSearch={vi.fn()}
        resetFilters={vi.fn()}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    const minInput = screen.getByLabelText(/harga minimum/i);
    fireEvent.change(minInput, { target: { value: '1500000' } });

    expect(setPriceMin).toHaveBeenCalledWith(1500000);
  });

  it('triggers setPriceMax when typing in the maximum price input', () => {
    const setPriceMax = vi.fn();
    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMin={0}
        setPriceMin={vi.fn()}
        priceMax={5000000}
        setPriceMax={setPriceMax}
        facilities={initialFacilities}
        toggleFacility={vi.fn()}
        handleSearch={vi.fn()}
        resetFilters={vi.fn()}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    const maxInput = screen.getByLabelText(/harga maksimum/i);
    fireEvent.change(maxInput, { target: { value: '7500000' } });

    expect(setPriceMax).toHaveBeenCalledWith(7500000);
  });

  it('triggers toggleFacility when clicking a facility pill', () => {
    const toggleFacility = vi.fn();
    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMin={0}
        setPriceMin={vi.fn()}
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
        priceMin={0}
        setPriceMin={vi.fn()}
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

  it('disables search button when isSearching is true', () => {
    render(
      <SearchFilterBar
        district="Semua"
        setDistrict={vi.fn()}
        priceMin={0}
        setPriceMin={vi.fn()}
        priceMax={5000000}
        setPriceMax={vi.fn()}
        facilities={initialFacilities}
        toggleFacility={vi.fn()}
        handleSearch={vi.fn()}
        resetFilters={vi.fn()}
        renderFacilityIcon={mockRenderIcon}
        isSearching={true}
      />
    );

    const searchButton = screen.getByRole('button', { name: /cari kos/i });
    expect(searchButton).toBeDisabled();
  });
});
