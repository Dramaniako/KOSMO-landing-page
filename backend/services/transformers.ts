import type { RowDataPacket } from 'mysql2/promise';
import type { Amenity } from '../types/index';

export const DEFAULT_PROPERTY_IMAGE =
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80';

export interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  district: string;
  address: string;
  price: number;
  rating: number;
  image: string;
  description: string;
  latitude: string;
  longitude: string;
  totalRooms: number;
  occupiedRooms: number;
  ownerId: string | null;
  document: string;
  facilities?: Amenity[] | string[];
}

/**
 * Normalizes property row data with numeric sanitization and default fallback values
 */
export function normalizeProperty(p: PropertyRow): PropertyRow {
  return {
    ...p,
    price: Number(p.price) || 0,
    totalRooms: Number(p.totalRooms) || 0,
    occupiedRooms: Number(p.occupiedRooms) || 0,
    rating: Number(p.rating) || 0,
    image: p.image && p.image.trim() !== '' ? p.image : DEFAULT_PROPERTY_IMAGE,
    facilities: Array.isArray(p.facilities) ? p.facilities : []
  };
}

/**
 * Normalizes property row for summary list responses, stripping heavy base64 strings
 * to keep catalog payloads lightweight (< 50 KB).
 */
export function normalizePropertySummary(p: PropertyRow): PropertyRow {
  const norm = normalizeProperty(p);
  if (norm.image && norm.image.startsWith('data:image') && norm.image.length > 2048) {
    norm.image = DEFAULT_PROPERTY_IMAGE;
  }
  return norm;
}
