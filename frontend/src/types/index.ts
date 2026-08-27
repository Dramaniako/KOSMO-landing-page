export type UserRole = 'tenant' | 'landlord' | 'admin';
export type IdentityType = 'NIK' | 'PASSPORT';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  paymentMethod?: string;
  avatar?: string | null;
  notifications?: boolean;
  language?: string;
  balance?: number;
  totalRevenue?: number;
  totalWithdrawn?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  identity_type?: IdentityType;
  identity_number?: string;
  address?: string;
  occupation?: string;
  emergency_contact_name?: string;
  emergency_contact_relation?: string;
  emergency_contact_phone?: string;
  date_of_birth?: string;
  gender?: string;
  isProfileComplete?: boolean;
  missingProfileFields?: string[];
}

export interface ProfileCompletenessResult {
  complete: boolean;
  missingFields: string[];
  missingFieldLabels: string[];
}

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

  // 1. Name
  if (!user.name || user.name.trim().length < 2) {
    missingFields.push('name');
    missingFieldLabels.push('Nama Lengkap (min. 2 karakter)');
  }

  // 2. Email
  if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email.trim())) {
    missingFields.push('email');
    missingFieldLabels.push('Alamat Email Valid');
  }

  // 3. Phone
  const cleanPhone = (user.phone || '').trim().replace(/[\s-]/g, '');
  if (!cleanPhone || cleanPhone.length < 9) {
    missingFields.push('phone');
    missingFieldLabels.push('Nomor HP/WhatsApp (min. 9 digit)');
  }

  // 4. Identity Document (NIK / Passport)
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

  // 5. Permanent / Domicile Address
  if (!user.address || user.address.trim().length < 5) {
    missingFields.push('address');
    missingFieldLabels.push('Alamat Domisili/KTP (min. 5 karakter)');
  }

  // 6. Occupation
  if (!user.occupation || user.occupation.trim().length < 2) {
    missingFields.push('occupation');
    missingFieldLabels.push('Pekerjaan/Profesi/Instansi');
  }

  // 7. Emergency Contact Name
  if (!user.emergency_contact_name || user.emergency_contact_name.trim().length < 2) {
    missingFields.push('emergency_contact_name');
    missingFieldLabels.push('Nama Kontak Darurat');
  }

  // 8. Emergency Contact Phone
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

export interface Property {
  id: string;
  name: string;
  district: string;
  address: string;
  price: number;
  rating: number;
  image: string;
  description: string;
  facilities: string[];
  latitude: string;
  longitude: string;
  totalRooms: number;
  occupiedRooms: number;
  ownerId: string | null;
  document?: string;
}

export interface Review {
  id: string;
  propertyId: string;
  propertyName: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
}

export type RentalStatus = 'pending' | 'active' | 'completed' | 'terminated' | 'cancelled';

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
  duration_months?: number;
  nextPaymentDate?: string;
  nextPaymentDateISO?: string;
  daysRemaining?: number;
  paymentStatus?: string;
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

export interface BookingRequest {
  propertyId: string;
  propertyName: string;
  price: number;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  durationMonths?: number;
  rentalId?: string;
  contractSigned?: boolean;
  tenantNikPassport?: string;
  adminFee?: number;
}

export interface SignedContractData {
  rentalId: string;
  contractUrl: string;
  contractHash: string;
  adminFee: number;
  totalAmount: number;
  signedAt: string;
}

export interface ContractSignPayload {
  propertyId: string;
  durationMonths: number;
  startDate: string;
  tenantNikPassport: string;
  signatureBase64: string;
  affirmativeConsent: boolean;
}

export interface RentalAgreement extends Rental {
  propertyAddress?: string;
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  tenantName?: string;
  tenantEmail?: string;
  tenantPhone?: string;
}


export interface Withdrawal {
  id: string;
  userId: string;
  bankName: string;
  accountNumber: string;
  accountHolder?: string;
  amount: number;
  date: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | string;
  referenceId?: string;
  rejectionReason?: string;
  processedAt?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
}

export interface AdminStats {
  totalVisitors: number;
  totalUsers: number;
  totalLandlords: number;
  totalProperties: number;
  totalRooms: number;
}

export interface TrackingHistoryItem {
  label: string;
  count: number;
}

export interface TrackingHistory {
  history24h: TrackingHistoryItem[];
  history7d: TrackingHistoryItem[];
  history30d: TrackingHistoryItem[];
}

export interface LandlordStats {
  balance: number;
  totalRevenue: number;
  totalWithdrawn: number;
  totalProperti: number;
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number;
  activeTenants: number;
  withdrawals: Withdrawal[];
  reviewsCount: number;
}

export interface FacilityFilterState {
  Listrik: boolean;
  Air: boolean;
  Wifi: boolean;
  Kebersihan: boolean;
  Keamanan: boolean;
  Parkir: boolean;
  [key: string]: boolean;
}
