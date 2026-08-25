const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
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
