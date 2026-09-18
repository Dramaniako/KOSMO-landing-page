export const DEFAULT_IDR_TO_USD_RATE = 16000;

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
});

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

/**
 * Format numeric or string amount into standard Indonesian Rupiah currency string (e.g., "Rp 2.500.000")
 */
export function formatRupiah(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return 'Rp 0';
  const numericVal = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(numericVal)) return 'Rp 0';
  return rupiahFormatter.format(numericVal).replace(/\s+/g, ' ');
}

/**
 * Format numeric IDR amount into approximate USD string based on exchange rate (e.g., "$156")
 */
export function formatUSD(
  val: number | string | undefined | null,
  rate: number = DEFAULT_IDR_TO_USD_RATE,
  decimals: number = 0
): string {
  if (val === undefined || val === null || val === '') return '$0';
  const numericVal = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(numericVal) || rate <= 0) return '$0';
  const usdVal = numericVal / rate;

  if (decimals > 0) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(usdVal);
  }

  const rounded = Math.round(usdVal);
  return usdFormatter.format(rounded);
}

export interface DualCurrencyOptions {
  rate?: number;
  suffix?: string;
  mode?: 'both' | 'idr' | 'usd';
}

/**
 * Format dual currency string (e.g., "Rp 2.500.000 / bln (~$156 USD)")
 */
export function formatDualCurrency(
  val: number | string | undefined | null,
  options?: DualCurrencyOptions
): string {
  const { rate = DEFAULT_IDR_TO_USD_RATE, suffix = '', mode = 'both' } = options || {};
  const idr = formatRupiah(val);
  const usd = formatUSD(val, rate);

  if (mode === 'idr') {
    return suffix ? `${idr} ${suffix}`.trim() : idr;
  }
  if (mode === 'usd') {
    return suffix ? `${usd} ${suffix}`.trim() : usd;
  }
  return suffix ? `${idr} ${suffix} (~${usd} USD)`.trim() : `${idr} (~${usd} USD)`;
}

