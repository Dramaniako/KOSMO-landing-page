import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SeoHead, { buildLandingJsonLd } from '../SeoHead';
import KosCard from '../KosCard';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { CurrencyProvider } from '../../context/CurrencyContext';
import type { Property } from '../../types/index';

describe('SeoHead, JSON-LD & Crawlable KosCard Links', () => {
  const sampleProperty: Property = {
    id: 'prop-01',
    name: 'Cove Nuansa Home Jimbaran',
    district: 'Jimbaran',
    address: 'Jl. Nuansa Utama No. 9, Jimbaran, Bali',
    price: 4150000,
    rating: 4.8,
    image: 'https://res.cloudinary.com/kosmo-bali/image/upload/v1/cove.webp',
    description: 'Co-living modern dekat Kampus Unud Bukit Jimbaran.',
    facilities: ['Wifi', 'AC', 'Listrik'],
    latitude: '-8.7895',
    longitude: '115.1762',
    totalRooms: 10,
    occupiedRooms: 2,
    ownerId: 'user-landlord'
  };

  beforeEach(() => {
    document.head.innerHTML = '';
    document.title = '';
  });

  it('updates canonical, meta description, robots, and Schema.org JSON-LD cleanly', () => {
    const jsonLd = buildLandingJsonLd({
      siteUrl: 'https://kosmobali.my.id',
      properties: [sampleProperty],
      selectedProperty: sampleProperty,
      activeDistrict: 'Semua',
      faqs: [{ question: 'Termasuk listrik?', answer: 'Ya, all-inclusive.' }]
    });

    render(
      <SeoHead
        title="Cove Nuansa Home Jimbaran | KOSMO"
        description="Kos all-inclusive di Jimbaran dekat Unud."
        canonicalPath="/kos/prop-01/cove-nuansa-home-jimbaran"
        image={sampleProperty.image}
        type="place"
        lang="id"
        jsonLd={jsonLd}
      />
    );

    expect(document.documentElement.lang).toBe('id');
    expect(document.title).toBe('Cove Nuansa Home Jimbaran | KOSMO');
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://kosmobali.my.id/kos/prop-01/cove-nuansa-home-jimbaran');
    expect(
      document.head.querySelector('meta[name="robots"]')?.getAttribute('content')
    ).toContain('index, follow');

    const ldScript = document.getElementById('kosmo-schema-jsonld');
    expect(ldScript).not.toBeNull();
    expect(ldScript?.textContent).toContain('LodgingBusiness');
    expect(ldScript?.textContent).toContain('FAQPage');
    expect(ldScript?.textContent).toContain('"price":4150000');
  });

  it('sets noindex, nofollow and removes JSON-LD on protected pages', () => {
    render(<SeoHead title="Admin Dashboard | KOSMO" noindex={true} />);
    expect(
      document.head.querySelector('meta[name="robots"]')?.getAttribute('content')
    ).toBe('noindex, nofollow');
    expect(document.getElementById('kosmo-schema-jsonld')).toBeNull();
  });

  it('KosCard wraps property title in a crawlable /kos/<id>/<slug> anchor while keeping modal click handler', () => {
    const onOpenDetail = vi.fn();

    render(
      <ThemeProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <KosCard
              property={sampleProperty}
              onOpenDetail={onOpenDetail}
              renderFacilityIcon={() => <span />}
            />
          </CurrencyProvider>
        </LanguageProvider>
      </ThemeProvider>
    );

    const link = screen.getByRole('link', { name: 'Cove Nuansa Home Jimbaran' });
    expect(link).toHaveAttribute('href', '/kos/prop-01/cove-nuansa-home-jimbaran');

    fireEvent.click(link);
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledWith(sampleProperty);
  });
});
