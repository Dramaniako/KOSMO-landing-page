import { describe, it, expect } from 'vitest';
import { getCloudinaryThumbUrl } from '../cloudinary';

describe('getCloudinaryThumbUrl', () => {
  it('returns empty string for empty or falsy inputs', () => {
    expect(getCloudinaryThumbUrl('')).toBe('');
    // @ts-expect-error test null edge cases
    expect(getCloudinaryThumbUrl(null)).toBe('');
    // @ts-expect-error test undefined edge cases
    expect(getCloudinaryThumbUrl(undefined)).toBe('');
  });

  it('returns original URL unaltered for non-Cloudinary images', () => {
    const unsplashUrl = 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800';
    const localUploadUrl = '/uploads/property-123.jpg';
    const externalUrl = 'https://example.com/images/room.png';

    expect(getCloudinaryThumbUrl(unsplashUrl)).toBe(unsplashUrl);
    expect(getCloudinaryThumbUrl(localUploadUrl)).toBe(localUploadUrl);
    expect(getCloudinaryThumbUrl(externalUrl)).toBe(externalUrl);
  });

  it('injects default dimensions w_128,h_112,c_fill,q_auto,f_auto into standard Cloudinary URL', () => {
    const originalUrl =
      'https://res.cloudinary.com/kosmo-bali/image/upload/v1725400000/kosmo_properties/prop_abc123.webp';
    const expectedUrl =
      'https://res.cloudinary.com/kosmo-bali/image/upload/w_128,h_112,c_fill,q_auto,f_auto/v1725400000/kosmo_properties/prop_abc123.webp';

    expect(getCloudinaryThumbUrl(originalUrl)).toBe(expectedUrl);
  });

  it('injects custom width and height parameters (e.g., 256x224 for 2x retina display)', () => {
    const originalUrl =
      'https://res.cloudinary.com/kosmo-bali/image/upload/v1/sample.jpg';
    const expectedUrl =
      'https://res.cloudinary.com/kosmo-bali/image/upload/w_256,h_224,c_fill,q_auto,f_auto/v1/sample.jpg';

    expect(getCloudinaryThumbUrl(originalUrl, 256, 224)).toBe(expectedUrl);
  });

  it('does not re-transform an already transformed Cloudinary URL', () => {
    const alreadyTransformedWidth =
      'https://res.cloudinary.com/kosmo-bali/image/upload/w_200,h_200/v1/sample.jpg';
    const alreadyTransformedCrop =
      'https://res.cloudinary.com/kosmo-bali/image/upload/c_fill,w_100/v1/sample.jpg';

    expect(getCloudinaryThumbUrl(alreadyTransformedWidth)).toBe(alreadyTransformedWidth);
    expect(getCloudinaryThumbUrl(alreadyTransformedCrop)).toBe(alreadyTransformedCrop);
  });

  it('handles Cloudinary URLs without version segment', () => {
    const noVersionUrl =
      'https://res.cloudinary.com/kosmo-bali/image/upload/kosmo_properties/room_101.jpg';
    const expectedUrl =
      'https://res.cloudinary.com/kosmo-bali/image/upload/w_128,h_112,c_fill,q_auto,f_auto/kosmo_properties/room_101.jpg';

    expect(getCloudinaryThumbUrl(noVersionUrl)).toBe(expectedUrl);
  });
});
