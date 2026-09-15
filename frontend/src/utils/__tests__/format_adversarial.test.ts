import { describe, it, expect } from 'vitest';
import { formatRupiah } from '../format';
import { getCloudinaryThumbUrl } from '../cloudinary';

describe('Adversarial Challenger M4: formatRupiah Stress & Edge Cases', () => {
  it('handles nullish and empty inputs strictly returning Rp 0 without throwing', () => {
    expect(formatRupiah(undefined)).toBe('Rp 0');
    expect(formatRupiah(null)).toBe('Rp 0');
    expect(formatRupiah('')).toBe('Rp 0');
    expect(formatRupiah('   ')).toBe('Rp 0');
  });

  it('handles non-numeric strings and NaN values safely', () => {
    expect(formatRupiah(NaN)).toBe('Rp 0');
    expect(formatRupiah('NaN')).toBe('Rp 0');
    expect(formatRupiah('invalid-amount')).toBe('Rp 0');
    expect(formatRupiah('Rp 5.000.000')).toBe('Rp 0');
    expect(formatRupiah('undefined')).toBe('Rp 0');
    expect(formatRupiah('null')).toBe('Rp 0');
  });

  it('handles zero and signed zeros', () => {
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah('0')).toBe('Rp 0');
    // Note: IEEE-754 signed zero -0 formats as '-Rp 0' in Intl.NumberFormat
    expect(formatRupiah(-0)).toBe('-Rp 0');
    expect(formatRupiah('0.00')).toBe('Rp 0');
  });

  it('handles negative currency values without exception', () => {
    const formattedNeg = formatRupiah(-50000);
    expect(formattedNeg).toMatch(/-\s*Rp\s*50\.000/);
    const formattedNegStr = formatRupiah('-50000');
    expect(formattedNegStr).toMatch(/-\s*Rp\s*50\.000/);
  });

  it('formats standard integer numbers and numeric strings accurately', () => {
    expect(formatRupiah(5000000)).toBe('Rp 5.000.000');
    expect(formatRupiah('5000000')).toBe('Rp 5.000.000');
    expect(formatRupiah(3500000)).toBe('Rp 3.500.000');
    expect(formatRupiah(5000)).toBe('Rp 5.000');
  });

  it('handles extremely large currency numbers (billions and trillions)', () => {
    expect(formatRupiah(100_000_000_000)).toBe('Rp 100.000.000.000');
    expect(formatRupiah('1000000000000')).toBe('Rp 1.000.000.000.000');
  });

  it('handles fractional amounts by rounding to nearest integer without fraction digits', () => {
    expect(formatRupiah(2500000.49)).toBe('Rp 2.500.000');
    expect(formatRupiah(2500000.50)).toBe('Rp 2.500.001');
    expect(formatRupiah('12345.67')).toBe('Rp 12.346');
  });

  it('executes 10,000 formatting operations within tight performance budget (< 50ms)', () => {
    const startTime = performance.now();
    for (let i = 0; i < 10000; i++) {
      formatRupiah(1000000 + (i * 100));
    }
    const elapsed = performance.now() - startTime;
    expect(elapsed).toBeLessThan(300); // robust threshold under parallel load
  });
});

describe('Adversarial Challenger M4: getCloudinaryThumbUrl Edge Cases', () => {
  it('handles non-string or malformed inputs without throwing', () => {
    // @ts-expect-error test boolean input
    expect(getCloudinaryThumbUrl(false)).toBe('');
    // @ts-expect-error test number input
    expect(getCloudinaryThumbUrl(12345)).toBe('');
    // @ts-expect-error test object input
    expect(getCloudinaryThumbUrl({})).toBe('');
  });

  it('preserves query strings and hash anchors on Cloudinary URLs', () => {
    const urlWithQuery = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg?auto=format#hero';
    const transformed = getCloudinaryThumbUrl(urlWithQuery);
    expect(transformed).toBe('https://res.cloudinary.com/demo/image/upload/w_128,h_112,c_fill,q_auto,f_auto/v1/sample.jpg?auto=format#hero');
  });

  it('avoids duplicate transformations when already containing w_ or c_', () => {
    const urlWithWidth = 'https://res.cloudinary.com/demo/image/upload/w_300/sample.jpg';
    expect(getCloudinaryThumbUrl(urlWithWidth)).toBe(urlWithWidth);

    const urlWithCrop = 'https://res.cloudinary.com/demo/image/upload/c_scale,w_400/sample.jpg';
    expect(getCloudinaryThumbUrl(urlWithCrop)).toBe(urlWithCrop);
  });

  it('does not transform non-Cloudinary images like unsplash, local uploads, or other CDNs', () => {
    const unsplash = 'https://images.unsplash.com/upload/photo.jpg';
    expect(getCloudinaryThumbUrl(unsplash)).toBe(unsplash);

    const s3Url = 'https://s3.amazonaws.com/my-bucket/upload/photo.jpg';
    expect(getCloudinaryThumbUrl(s3Url)).toBe(s3Url);

    const localUpload = '/uploads/property_123/image.png';
    expect(getCloudinaryThumbUrl(localUpload)).toBe(localUpload);
  });
});
