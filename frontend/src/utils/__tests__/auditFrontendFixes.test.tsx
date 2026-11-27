import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import KosCard, { optimizeCloudinaryThumbnail } from '../../components/KosCard';
import { uploadPropertyCoverImage } from '../uploadImage';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { CurrencyProvider } from '../../context/CurrencyContext';
import type { Property } from '../../types/index';

describe('Audit Frontend Hardening Fixes (FE-01 & Media Optimization)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('optimizeCloudinaryThumbnail injects w_400,h_300,f_webp,q_80 on Cloudinary URLs only', () => {
    const rawCdn = 'https://res.cloudinary.com/kosmo-bali/image/upload/v1730000000/kosmo_properties/sample.webp';
    expect(optimizeCloudinaryThumbnail(rawCdn)).toBe(
      'https://res.cloudinary.com/kosmo-bali/image/upload/c_fill,w_400,h_300,f_webp,q_80/v1730000000/kosmo_properties/sample.webp'
    );

    const alreadyTransformed =
      'https://res.cloudinary.com/kosmo-bali/image/upload/c_fill,w_800,h_600/v1/kosmo/test.webp';
    expect(optimizeCloudinaryThumbnail(alreadyTransformed)).toBe(alreadyTransformed);

    const externalUrl = 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6';
    expect(optimizeCloudinaryThumbnail(externalUrl)).toBe(externalUrl);
  });

  it('KosCard renders optimized Cloudinary thumbnail URL', () => {
    const mockProp: Property = {
      id: 'prop-cdn-1',
      name: 'Kos CDN Test',
      district: 'Canggu',
      address: 'Jl. Pantai Berawa No. 10',
      price: 3500000,
      rating: 4.9,
      image: 'https://res.cloudinary.com/kosmo-bali/image/upload/v123/kosmo_properties/villa.jpg',
      description: 'Cozy',
      facilities: ['Wifi', 'AC'],
      latitude: '-8.65',
      longitude: '115.13',
      totalRooms: 5,
      occupiedRooms: 1,
      ownerId: 'user-landlord'
    };

    render(
      <ThemeProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <KosCard
              property={mockProp}
              onOpenDetail={() => {}}
              renderFacilityIcon={() => <span />}
            />
          </CurrencyProvider>
        </LanguageProvider>
      </ThemeProvider>
    );

    const img = screen.getByAltText('Kos CDN Test') as HTMLImageElement;
    expect(img.src).toContain('/image/upload/c_fill,w_400,h_300,f_webp,q_80/');
  });

  it('uploadPropertyCoverImage sends multipart FormData to /api/upload and rejects >5MB files', async () => {
    localStorage.setItem('token', 'jwt-landlord-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://res.cloudinary.com/kosmo-bali/image/upload/v1/cover.webp' })
    } as Response);
    global.fetch = fetchMock;

    const smallFile = new File([new Uint8Array(100)], 'cover.png', { type: 'image/png' });
    const url = await uploadPropertyCoverImage(smallFile, '/api');

    expect(url).toBe('https://res.cloudinary.com/kosmo-bali/image/upload/v1/cover.webp');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upload',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer jwt-landlord-token' },
        body: expect.any(FormData)
      })
    );

    const oversizedFile = new File([new Uint8Array(10)], 'huge.png', { type: 'image/png' });
    Object.defineProperty(oversizedFile, 'size', { value: 6 * 1024 * 1024 });
    await expect(uploadPropertyCoverImage(oversizedFile, '/api')).rejects.toThrow(/maksimal 5MB/i);
  });
});
