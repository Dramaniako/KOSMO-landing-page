import type { RowDataPacket } from 'mysql2/promise';

/**
 * Core Domain Type Definitions for KOSMO
 * Strict TypeScript interfaces with zero `any` usage
 */

export type RoomType = 'putra' | 'putri' | 'campur';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export type UserRole = 'tenant' | 'landlord' | 'admin' | 'owner';

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
export const VALID_USER_ROLES: readonly UserRole[] = ['tenant', 'landlord', 'admin', 'owner'] as const;
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

export interface Property {
  id: string;
  name: string;
  district: string;
  address: string;
  price: number;
  rating: number;
  totalRooms: number;
  occupiedRooms: number;
  coordinates: Coordinates;
  images: string[];
  facilities: string[];
  ownerId: string;
}

export interface Review {
  id: string;
  propertyId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  date: string;
  comment: string;
}

/**
 * Validation helper for Property schema
 */
export function validateProperty(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Property must be a non-null object'] };
  }

  const prop = data as Record<string, unknown>;

  if (typeof prop.id !== 'string' || !prop.id.trim()) {
    errors.push('id must be a non-empty string');
  }
  if (typeof prop.name !== 'string' || !prop.name.trim()) {
    errors.push('name must be a non-empty string');
  }
  if (typeof prop.district !== 'string' || !prop.district.trim()) {
    errors.push('district must be a non-empty string');
  }
  if (typeof prop.address !== 'string' || !prop.address.trim()) {
    errors.push('address must be a non-empty string');
  }
  if (typeof prop.price !== 'number' || Number.isNaN(prop.price) || prop.price <= 0) {
    errors.push('price must be a positive number');
  }
  if (typeof prop.rating !== 'number' || Number.isNaN(prop.rating) || prop.rating < 1 || prop.rating > 5) {
    errors.push('rating must be a number between 1 and 5');
  }
  if (typeof prop.totalRooms !== 'number' || !Number.isInteger(prop.totalRooms) || prop.totalRooms <= 0) {
    errors.push('totalRooms must be an integer greater than 0');
  }
  if (typeof prop.occupiedRooms !== 'number' || !Number.isInteger(prop.occupiedRooms) || prop.occupiedRooms < 0) {
    errors.push('occupiedRooms must be a non-negative integer');
  } else if (typeof prop.totalRooms === 'number' && prop.occupiedRooms > prop.totalRooms) {
    errors.push('occupiedRooms cannot exceed totalRooms');
  }

  if (!prop.coordinates || typeof prop.coordinates !== 'object') {
    errors.push('coordinates must be an object with lat and lng numbers');
  } else {
    const coords = prop.coordinates as Record<string, unknown>;
    if (typeof coords.lat !== 'number' || Number.isNaN(coords.lat) || coords.lat < -90 || coords.lat > 90) {
      errors.push('coordinates.lat must be a valid latitude between -90 and 90');
    }
    if (typeof coords.lng !== 'number' || Number.isNaN(coords.lng) || coords.lng < -180 || coords.lng > 180) {
      errors.push('coordinates.lng must be a valid longitude between -180 and 180');
    }
  }

  if (!Array.isArray(prop.images) || prop.images.some(img => typeof img !== 'string')) {
    errors.push('images must be an array of strings');
  }
  if (!Array.isArray(prop.facilities) || prop.facilities.some(f => typeof f !== 'string')) {
    errors.push('facilities must be an array of strings');
  }
  if (typeof prop.ownerId !== 'string' || !prop.ownerId.trim()) {
    errors.push('ownerId must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validation helper for Review schema
 */
export function validateReview(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Review must be a non-null object'] };
  }

  const review = data as Record<string, unknown>;

  if (typeof review.id !== 'string' || !review.id.trim()) {
    errors.push('id must be a non-empty string');
  }
  if (typeof review.propertyId !== 'string' || !review.propertyId.trim()) {
    errors.push('propertyId must be a non-empty string');
  }
  if (typeof review.userName !== 'string' || !review.userName.trim()) {
    errors.push('userName must be a non-empty string');
  }
  if (typeof review.rating !== 'number' || Number.isNaN(review.rating) || review.rating < 1 || review.rating > 5) {
    errors.push('rating must be a number between 1 and 5');
  }
  if (typeof review.comment !== 'string' || !review.comment.trim()) {
    errors.push('comment must be a non-empty string');
  }
  if (typeof review.date !== 'string' || !review.date.trim()) {
    errors.push('date must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

export type RentalStatus = 'pending' | 'active' | 'completed' | 'terminated' | 'cancelled';
export const VALID_RENTAL_STATUSES: readonly RentalStatus[] = [
  'pending',
  'active',
  'completed',
  'terminated',
  'cancelled'
] as const;

export interface Rental {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyName: string;
  price: number;
  startDate: string;
  status: RentalStatus;
  document?: string;
  contract_url?: string | null;
  contract_hash?: string | null;
  contract_signed_at?: string | Date | null;
  signer_ip?: string | null;
  signer_user_agent?: string | null;
  tenant_nik_passport?: string | null;
  tenant_signature_data?: string | null;
  admin_fee_amount?: number;
  nextPaymentDate?: string;
  nextPaymentDateISO?: string;
  daysRemaining?: number;
  paymentStatus?: string;
}

export interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyName: string;
  price: number;
  startDate: string;
  status: RentalStatus;
  document?: string;
  contract_url?: string | null;
  contract_hash?: string | null;
  contract_signed_at?: string | Date | null;
  signer_ip?: string | null;
  signer_user_agent?: string | null;
  tenant_nik_passport?: string | null;
  tenant_signature_data?: string | null;
  admin_fee_amount?: number | string;
}

export interface UtilityQuotas {
  electricityKwh?: number | string;
  water?: string;
  wifiMbps?: number | string;
  security?: string;
  waste?: string;
}

export interface RentalContractData {
  rentalId?: string;
  propertyName: string;
  propertyAddress?: string;
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone?: string;
  tenantNikPassport?: string;
  startDate: string;
  durationMonths?: number;
  monthlyPrice?: number;
  pricePerMonth?: number;
  totalPrice?: number;
  adminFee?: number;
  signatureBase64?: string;
  signerIp?: string;
  signerUserAgent?: string;
  signedAt?: string | Date;
  utilityQuotas?: UtilityQuotas;
}

export interface GeneratedContractResult {
  pdfBuffer: Buffer;
  contractHash: string;
  cloudinaryUrl?: string;
}

/**
 * Validation helper for Rental schema
 */
export function validateRental(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Rental must be a non-null object'] };
  }

  const rental = data as Record<string, unknown>;

  if (typeof rental.id !== 'string' || !rental.id.trim()) {
    errors.push('id must be a non-empty string');
  }
  if (typeof rental.tenantId !== 'string' || !rental.tenantId.trim()) {
    errors.push('tenantId must be a non-empty string');
  }
  if (typeof rental.propertyId !== 'string' || !rental.propertyId.trim()) {
    errors.push('propertyId must be a non-empty string');
  }
  if (typeof rental.propertyName !== 'string' || !rental.propertyName.trim()) {
    errors.push('propertyName must be a non-empty string');
  }
  if (typeof rental.price !== 'number' || Number.isNaN(rental.price) || rental.price <= 0) {
    errors.push('price must be a positive number');
  }
  if (typeof rental.startDate !== 'string' || !rental.startDate.trim()) {
    errors.push('startDate must be a non-empty string');
  }
  if (typeof rental.status !== 'string' || !VALID_RENTAL_STATUSES.includes(rental.status as RentalStatus)) {
    errors.push(`status must be one of: ${VALID_RENTAL_STATUSES.join(', ')}`);
  }
  if (rental.contract_hash !== undefined && rental.contract_hash !== null) {
    if (typeof rental.contract_hash !== 'string' || rental.contract_hash.length !== 64) {
      errors.push('contract_hash must be a 64-character SHA-256 hexadecimal string');
    }
  }
  if (rental.admin_fee_amount !== undefined && rental.admin_fee_amount !== null) {
    if (typeof rental.admin_fee_amount !== 'number' || Number.isNaN(rental.admin_fee_amount) || rental.admin_fee_amount < 0) {
      errors.push('admin_fee_amount must be a non-negative number');
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface ContractPreviewRequest {
  propertyId: string;
  durationMonths?: number;
  startDate?: string;
  tenantNikPassport?: string;
  signatureBase64?: string;
  rentalId?: string;
}

export interface ContractPreviewResponse {
  success: boolean;
  contractData: RentalContractData;
  contractHash: string;
  previewUrl?: string;
  monthlyPrice: number;
  adminFee: number;
  totalPrice: number;
  totalAmount: number;
}

export interface ContractSignRequest {
  propertyId: string;
  durationMonths: number;
  startDate: string;
  tenantNikPassport: string;
  signatureBase64: string;
  affirmativeConsent: true;
  rentalId?: string;
}

export interface ContractSignResponse {
  success: boolean;
  message: string;
  rentalId: string;
  contractUrl: string;
  contractHash: string;
  adminFee: number;
  totalAmount: number;
  signedAt: string;
}

export interface RentalContractJoinedRow extends RowDataPacket {
  rental_id: string;
  rental_tenant_id: string;
  rental_property_id: string;
  rental_property_name: string;
  rental_price: number;
  rental_start_date: string;
  rental_status: RentalStatus;
  rental_document?: string;
  contract_url?: string | null;
  contract_hash?: string | null;
  contract_signed_at?: string | Date | null;
  signer_ip?: string | null;
  signer_user_agent?: string | null;
  tenant_nik_passport?: string | null;
  tenant_signature_data?: string | null;
  admin_fee_amount?: number | string;
  property_name?: string;
  property_address?: string;
  property_price?: number;
  property_owner_id?: string;
  tenant_name?: string;
  tenant_email?: string;
  tenant_phone?: string;
  landlord_name?: string;
  landlord_email?: string;
  landlord_phone?: string;
}

