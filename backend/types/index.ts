/**
 * Core Domain Type Definitions for KOSMO
 * Strict TypeScript interfaces with zero `any` usage
 */

export type RoomType = 'putra' | 'putri' | 'campur';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export type UserRole = 'tenant' | 'owner' | 'admin';

export type Amenity =
  | 'Wifi'
  | 'AC'
  | 'Parkir'
  | 'Kebersihan'
  | 'Kolam renang'
  | 'Keamanan'
  | 'Listrik'
  | 'Air'
  | 'Dapur'
  | 'Kamar Mandi Dalam'
  | 'Water Heater'
  | 'Kasur'
  | 'Lemari'
  | 'Meja Belajar';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface KosRoom {
  id: string;
  name: string;
  slug: string;
  address: string;
  pricePerMonth: number;
  coordinates: Coordinates;
  amenities: Amenity[];
  roomType: RoomType;
  images: string[];
  isAvailable: boolean;
}

export interface Booking {
  id: string;
  roomId: string;
  userId: string;
  startDate: string;
  durationMonths: number;
  status: BookingStatus;
  totalPrice: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
}

export const VALID_ROOM_TYPES: readonly RoomType[] = ['putra', 'putri', 'campur'] as const;
export const VALID_BOOKING_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'cancelled'] as const;
export const VALID_USER_ROLES: readonly UserRole[] = ['tenant', 'owner', 'admin'] as const;
export const VALID_AMENITIES: readonly Amenity[] = [
  'Wifi',
  'AC',
  'Parkir',
  'Kebersihan',
  'Kolam renang',
  'Keamanan',
  'Listrik',
  'Air',
  'Dapur',
  'Kamar Mandi Dalam',
  'Water Heater',
  'Kasur',
  'Lemari',
  'Meja Belajar'
] as const;

/**
 * Validation helper for KosRoom schema
 */
export function validateKosRoom(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['KosRoom must be a non-null object'] };
  }

  const room = data as Record<string, unknown>;

  if (typeof room.id !== 'string' || !room.id.trim()) {
    errors.push('id must be a non-empty string');
  }
  if (typeof room.name !== 'string' || !room.name.trim()) {
    errors.push('name must be a non-empty string');
  }
  if (typeof room.slug !== 'string' || !room.slug.trim()) {
    errors.push('slug must be a non-empty string');
  }
  if (typeof room.address !== 'string' || !room.address.trim()) {
    errors.push('address must be a non-empty string');
  }
  if (typeof room.pricePerMonth !== 'number' || Number.isNaN(room.pricePerMonth) || room.pricePerMonth < 0) {
    errors.push('pricePerMonth must be a non-negative number');
  }

  if (!room.coordinates || typeof room.coordinates !== 'object') {
    errors.push('coordinates must be an object with lat and lng numbers');
  } else {
    const coords = room.coordinates as Record<string, unknown>;
    if (typeof coords.lat !== 'number' || Number.isNaN(coords.lat)) {
      errors.push('coordinates.lat must be a number');
    }
    if (typeof coords.lng !== 'number' || Number.isNaN(coords.lng)) {
      errors.push('coordinates.lng must be a number');
    }
  }

  if (!Array.isArray(room.amenities)) {
    errors.push('amenities must be an array of valid Amenity strings');
  } else {
    for (const a of room.amenities) {
      if (typeof a !== 'string' || !VALID_AMENITIES.includes(a as Amenity)) {
        errors.push(`Invalid amenity: ${String(a)}`);
      }
    }
  }

  if (typeof room.roomType !== 'string' || !VALID_ROOM_TYPES.includes(room.roomType as RoomType)) {
    errors.push(`roomType must be one of: ${VALID_ROOM_TYPES.join(', ')}`);
  }

  if (!Array.isArray(room.images) || room.images.some(img => typeof img !== 'string')) {
    errors.push('images must be an array of strings');
  }

  if (typeof room.isAvailable !== 'boolean') {
    errors.push('isAvailable must be a boolean');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validation helper for Booking schema
 */
export function validateBooking(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Booking must be a non-null object'] };
  }

  const booking = data as Record<string, unknown>;

  if (typeof booking.id !== 'string' || !booking.id.trim()) {
    errors.push('id must be a non-empty string');
  }
  if (typeof booking.roomId !== 'string' || !booking.roomId.trim()) {
    errors.push('roomId must be a non-empty string');
  }
  if (typeof booking.userId !== 'string' || !booking.userId.trim()) {
    errors.push('userId must be a non-empty string');
  }
  if (typeof booking.startDate !== 'string' || !booking.startDate.trim()) {
    errors.push('startDate must be a non-empty string');
  }
  if (typeof booking.durationMonths !== 'number' || !Number.isInteger(booking.durationMonths) || booking.durationMonths <= 0) {
    errors.push('durationMonths must be a positive integer');
  }
  if (typeof booking.status !== 'string' || !VALID_BOOKING_STATUSES.includes(booking.status as BookingStatus)) {
    errors.push(`status must be one of: ${VALID_BOOKING_STATUSES.join(', ')}`);
  }
  if (typeof booking.totalPrice !== 'number' || Number.isNaN(booking.totalPrice) || booking.totalPrice < 0) {
    errors.push('totalPrice must be a non-negative number');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validation helper for User schema
 */
export function validateUser(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['User must be a non-null object'] };
  }

  const user = data as Record<string, unknown>;

  if (typeof user.id !== 'string' || !user.id.trim()) {
    errors.push('id must be a non-empty string');
  }
  if (typeof user.name !== 'string' || !user.name.trim()) {
    errors.push('name must be a non-empty string');
  }
  if (typeof user.email !== 'string' || !user.email.includes('@')) {
    errors.push('email must be a valid email string');
  }
  if (typeof user.phone !== 'string' || !user.phone.trim()) {
    errors.push('phone must be a non-empty string');
  }
  if (typeof user.role !== 'string' || !VALID_USER_ROLES.includes(user.role as UserRole)) {
    errors.push(`role must be one of: ${VALID_USER_ROLES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}
