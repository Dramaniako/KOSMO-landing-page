import { describe, it, expect } from 'vitest';
import {
  formatUSD,
  formatDualCurrency,
  formatRupiah,
  DEFAULT_IDR_TO_USD_RATE
} from '../format';

describe('Dual-Currency Helpers (formatUSD & formatDualCurrency)', () => {
  it('DEFAULT_IDR_TO_USD_RATE is defined and approximately 16,000 IDR/USD', () => {
    expect(DEFAULT_IDR_TO_USD_RATE).toBe(16000);
  });

  describe('formatUSD', () => {
    it('handles null, undefined, empty string and NaN inputs safely', () => {
      expect(formatUSD(null)).toBe('$0');
      expect(formatUSD(undefined)).toBe('$0');
      expect(formatUSD('')).toBe('$0');
      expect(formatUSD('   ')).toBe('$0');
      expect(formatUSD(NaN)).toBe('$0');
      expect(formatUSD('not-a-number')).toBe('$0');
    });

    it('formats 0 and -0 safely', () => {
      expect(formatUSD(0)).toBe('$0');
      expect(formatUSD('0')).toBe('$0');
    });

    it('converts IDR to USD with default 16,000 exchange rate correctly', () => {
      // 16,000 IDR = 1 USD
      expect(formatUSD(16000)).toBe('$1');
      // 160,000 IDR = 10 USD
      expect(formatUSD(160000)).toBe('$10');
      // 1,600,000 IDR = 100 USD
      expect(formatUSD(1600000)).toBe('$100');
      // 2,500,000 IDR = ~156 USD (2500000 / 16000 = 156.25 -> round 156)
      expect(formatUSD(2500000)).toBe('$156');
      // 3,200,000 IDR = 200 USD
      expect(formatUSD(3200000)).toBe('$200');
    });

    it('supports custom exchange rate', () => {
      // Custom rate: 15,000
      expect(formatUSD(1500000, 15000)).toBe('$100');
      expect(formatUSD(3000000, 15000)).toBe('$200');
    });

    it('supports decimals when requested', () => {
      // 2,500,000 / 16,000 = 156.25
      expect(formatUSD(2500000, 16000, 2)).toBe('$156.25');
    });
  });

  describe('formatDualCurrency', () => {
    it('formats dual currency string with default options (Rp X (~$Y USD))', () => {
      const res = formatDualCurrency(2500000);
      expect(res).toBe('Rp 2.500.000 (~$156 USD)');
    });

    it('appends suffix before USD approximation (e.g. / bln)', () => {
      const res = formatDualCurrency(2500000, { suffix: '/ bln' });
      expect(res).toBe('Rp 2.500.000 / bln (~$156 USD)');
    });

    it('respects mode: idr (shows only IDR)', () => {
      const res = formatDualCurrency(2500000, { mode: 'idr', suffix: '/ bln' });
      expect(res).toBe('Rp 2.500.000 / bln');
    });

    it('respects mode: usd (shows only USD)', () => {
      const res = formatDualCurrency(2500000, { mode: 'usd', suffix: '/ mo' });
      expect(res).toBe('$156 / mo');
    });

    it('handles zero amount gracefully', () => {
      const res = formatDualCurrency(0);
      expect(res).toBe('Rp 0 (~$0 USD)');
    });
  });
});
