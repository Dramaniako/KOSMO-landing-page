import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KosCard from '../KosCard';
import ThemeLanguageToggle, { CurrencyToggle } from '../ThemeLanguageToggle';
import { Property } from '../../types/index';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        {ui}
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
});
