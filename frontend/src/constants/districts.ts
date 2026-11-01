export const BALI_DISTRICTS = [
  'Canggu',
  'Seminyak',
  'Ubud',
  'Jimbaran',
  'Uluwatu',
  'Kuta',
  'Sanur',
  'Denpasar',
  'Badung',
  'Gianyar',
  'Tabanan'
] as const;

export type BaliDistrict = typeof BALI_DISTRICTS[number];
