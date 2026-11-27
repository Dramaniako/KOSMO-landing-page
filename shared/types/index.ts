/**
 * Shared Canonical Domain Types & Helpers for KOSMO (Backend + Frontend)
 * Zero Node-only or DB-driver dependencies so Vite & esbuild bundle identically.
 */

export type CanonicalUserRole = 'tenant' | 'landlord' | 'admin';
export type LegacyCompatibleUserRole = CanonicalUserRole | 'owner';
export type IdentityType = 'NIK' | 'PASSPORT';

export type RentalStatus = 'pending' | 'active' | 'completed' | 'terminated' | 'cancelled';
export type DiscreteRoomStatus = 'available' | 'occupied' | 'maintenance';
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'rejected';

export type PhotoCategory =
  | 'thumbnail'
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'pool'
  | 'living_room'
  | 'wifi_speedtest'
  | 'exterior'
  | 'other';

export type TicketCategory = 'ac' | 'plumbing' | 'wifi' | 'electricity' | 'cleaning' | 'other';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled';

export interface ProfileCompletenessResult {
  complete: boolean;
  missingFields: string[];
  missingFieldLabels: string[];
}

/**
 * Validates statutory KYC profile completeness required before lease execution
 * (Pasal 1320 KUHPerdata & UU ITE).
 */
export function isUserProfileComplete(user: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  identity_type?: string | null;
  identity_number?: string | null;
  address?: string | null;
  occupation?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
} | null | undefined): ProfileCompletenessResult {
  const missingFields: string[] = [];
  const missingFieldLabels: string[] = [];

  if (!user) {
    return {
      complete: false,
      missingFields: ['user'],
      missingFieldLabels: ['Data Pengguna']
    };
  }

  if (!user.name || user.name.trim().length < 2) {
    missingFields.push('name');
    missingFieldLabels.push('Nama Lengkap (min. 2 karakter)');
  }

  if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email.trim())) {
    missingFields.push('email');
    missingFieldLabels.push('Alamat Email Valid');
  }

  const cleanPhone = (user.phone || '').trim().replace(/[\s-]/g, '');
  if (!cleanPhone || cleanPhone.length < 9) {
    missingFields.push('phone');
    missingFieldLabels.push('Nomor HP/WhatsApp (min. 9 digit)');
  }

  const idType = user.identity_type || 'NIK';
  const cleanId = (user.identity_number || '').trim();
  if (idType === 'NIK') {
    if (!/^\d{16}$/.test(cleanId)) {
      missingFields.push('identity_number');
      missingFieldLabels.push('Nomor NIK KTP (tepat 16 digit angka)');
    }
  } else {
    if (!/^[A-Za-z0-9]{6,12}$/.test(cleanId)) {
      missingFields.push('identity_number');
      missingFieldLabels.push('Nomor Paspor (6-12 karakter alfanumerik)');
    }
  }

  if (!user.address || user.address.trim().length < 5) {
    missingFields.push('address');
    missingFieldLabels.push('Alamat Domisili/KTP (min. 5 karakter)');
  }

  if (!user.occupation || user.occupation.trim().length < 2) {
    missingFields.push('occupation');
    missingFieldLabels.push('Pekerjaan/Profesi/Instansi');
  }

  if (!user.emergency_contact_name || user.emergency_contact_name.trim().length < 2) {
    missingFields.push('emergency_contact_name');
    missingFieldLabels.push('Nama Kontak Darurat');
  }

  const cleanEmerPhone = (user.emergency_contact_phone || '').trim().replace(/[\s-]/g, '');
  if (!cleanEmerPhone || cleanEmerPhone.length < 9) {
    missingFields.push('emergency_contact_phone');
    missingFieldLabels.push('Nomor Telepon Kontak Darurat');
  }

  return {
    complete: missingFields.length === 0,
    missingFields,
    missingFieldLabels
  };
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
  roomId?: string;
  roomNumber?: string;
  roomFloor?: number;
  roomType?: string;
  propertyName: string;
  propertyAddress?: string;
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone?: string;
  tenantNikPassport?: string;
  tenantAddress?: string;
  tenantOccupation?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
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

export interface ContractPreviewRequest {
  propertyId: string;
  durationMonths?: number;
  roomId?: string;
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
  roomId?: string;
  startDate: string;
  tenantNikPassport: string;
  signatureBase64: string;
  affirmativeConsent: boolean;
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
