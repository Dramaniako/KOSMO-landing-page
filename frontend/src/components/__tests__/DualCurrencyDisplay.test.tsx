import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KosCard from '../KosCard';
import ThemeLanguageToggle, { CurrencyToggle } from '../ThemeLanguageToggle';
import { Property } from '../../types/index';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { CurrencyProvider } from '../../context/CurrencyContext';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <CurrencyProvider>
          {ui}
        </CurrencyProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

describe('Dual-Currency Display & CurrencyToggle Components', () => {
  const mockProperty: Property = {
    id: 'prop-dual-01',
    name: 'KOSMO Canggu Sanctuary',
    district: 'Badung',
    address: 'Jl. Batu Bolong No. 12, Canggu',
    price: 3200000,
    rating: 4.9,
    image: 'https://example.com/canggu.jpg',
    description: 'Co-living modern dekat pantai Canggu',
    facilities: ['Wifi', 'AC', 'Parkir'],
    latitude: '-8.6500',
    longitude: '115.1300',
    totalRooms: 10,
    occupiedRooms: 6,
    ownerId: 'landlord-1'
  };

  const mockRenderIcon = (name: string) => <span data-testid={`icon-${name}`} />;

  it('KosCard renders IDR price and secondary approximate USD amount', () => {
    const handleOpenDetail = vi.fn();
    render(
      <KosCard
        property={mockProperty}
        onOpenDetail={handleOpenDetail}
        renderFacilityIcon={mockRenderIcon}
      />
    );

    // Verify Indonesian Rupiah price
    expect(screen.getByText(/3\.200\.000/)).toBeInTheDocument();
    // 3,200,000 / 16,000 = $200 USD
    expect(screen.getByText(/~\$200 USD/)).toBeInTheDocument();
    expect(screen.getByText('/bulan')).toBeInTheDocument();
  });

  it('CurrencyToggle component cycles through preferences (IDR -> USD -> IDR/USD)', () => {
    const handleToggle = vi.fn();
    render(<CurrencyToggle preference="both" onToggle={handleToggle} />);

    const button = screen.getByRole('button', { name: /ubah preferensi mata uang/i });
    expect(button).toBeInTheDocument();
    expect(button.textContent).toContain('IDR/USD');

    // Click to cycle: both -> idr
    fireEvent.click(button);
    expect(handleToggle).toHaveBeenCalledWith('idr');
    expect(button.textContent).toContain('IDR');

    // Click to cycle: idr -> usd
    fireEvent.click(button);
    expect(handleToggle).toHaveBeenCalledWith('usd');
    expect(button.textContent).toContain('USD');

    // Click to cycle: usd -> both
    fireEvent.click(button);
    expect(handleToggle).toHaveBeenCalledWith('both');
    expect(button.textContent).toContain('IDR/USD');
  });

  it('ThemeLanguageToggle renders optional CurrencyToggle when showCurrencyToggle is true', () => {
    renderWithProviders(<ThemeLanguageToggle showCurrencyToggle={true} />);

    const buttons = screen.getAllByRole('button');
    // Language, Theme, + Currency = 3 buttons
    expect(buttons.length).toBe(3);
    expect(screen.getByRole('button', { name: /ubah preferensi mata uang/i })).toBeInTheDocument();
  });

  it('KosCard renders only IDR price when currencyPreference is idr', () => {
    const handleOpenDetail = vi.fn();
    render(
      <KosCard
        property={mockProperty}
        onOpenDetail={handleOpenDetail}
        renderFacilityIcon={mockRenderIcon}
        currencyPreference="idr"
      />
    );

    expect(screen.getByText(/3\.200\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it('KosCard renders only USD price when currencyPreference is usd', () => {
    const handleOpenDetail = vi.fn();
    render(
      <KosCard
        property={mockProperty}
        onOpenDetail={handleOpenDetail}
        renderFacilityIcon={mockRenderIcon}
        currencyPreference="usd"
      />
    );

    expect(screen.getByText(/\$200/)).toBeInTheDocument();
    expect(screen.queryByText(/3\.200\.000/)).not.toBeInTheDocument();
  });

  it('KosCard reacts reactively when CurrencyToggle switches active currency inside CurrencyProvider', () => {
    function IntegratedComponent() {
      return (
        <div>
          <CurrencyToggle />
          <KosCard
            property={mockProperty}
            onOpenDetail={vi.fn()}
            renderFacilityIcon={mockRenderIcon}
          />
        </div>
      );
    }

    render(
      <CurrencyProvider>
        <IntegratedComponent />
      </CurrencyProvider>
    );

    // Initial state: both
    expect(screen.getByText(/3\.200\.000/)).toBeInTheDocument();
    expect(screen.getByText(/~\$200 USD/)).toBeInTheDocument();

    const toggleButton = screen.getByRole('button', { name: /ubah preferensi mata uang/i });

    // 1st click: switches to 'idr'
    fireEvent.click(toggleButton);
    expect(screen.getByText(/3\.200\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/~\$200 USD/)).not.toBeInTheDocument();

    // 2nd click: switches to 'usd'
    fireEvent.click(toggleButton);
    expect(screen.getByText(/\$200/)).toBeInTheDocument();
    expect(screen.queryByText(/3\.200\.000/)).not.toBeInTheDocument();

    // 3rd click: switches back to 'both'
    fireEvent.click(toggleButton);
    expect(screen.getByText(/3\.200\.000/)).toBeInTheDocument();
    expect(screen.getByText(/~\$200 USD/)).toBeInTheDocument();
  });
});
