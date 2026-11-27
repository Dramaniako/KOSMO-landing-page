/**
 * Pure Shared SEO Utilities for KOSMO (Frontend + Backend)
 */

export const DEFAULT_SITE_URL = 'https://kosmobali.my.id';

export const BALI_SEO_DISTRICTS = [
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

export function slugifySeo(input: string): string {
  const cleaned = (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'kos-bali';
}

export function buildPropertySeoPath(property: { id: string; name?: string | null }): string {
  const slug = slugifySeo(property.name || 'kos-bali');
  return `/kos/${encodeURIComponent(property.id)}/${slug}`;
}

export function buildDistrictSeoPath(district: string): string {
  return `/area/${slugifySeo(district)}`;
}

export function resolveDistrictFromSlug(slug?: string | null): string | null {
  if (!slug || typeof slug !== 'string') return null;
  const target = slugifySeo(slug);
  const match = BALI_SEO_DISTRICTS.find((d) => slugifySeo(d) === target);
  return match || null;
}

export function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
